const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDRp14EfXQNn-R-vR_YKAS3Tw1cI2hZFCk",
  authDomain: "sky-lantern-cccec.firebaseapp.com",
  databaseURL: "https://sky-lantern-cccec-default-rtdb.firebaseio.com",
  projectId: "sky-lantern-cccec",
  storageBucket: "sky-lantern-cccec.firebasestorage.app",
  messagingSenderId: "568669120282",
  appId: "1:568669120282:web:f5e717081a016554276ea3",
};

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase,
  ref as dbRef,
  onValue,
  set,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const { createApp, ref, computed, onMounted } = Vue;

const STORAGE_KEY = 'onecomme_sky_lantern_archive_v1';
const MAX_SKY_DISPLAY = 50;

const skyStyleCache = new Map();
const initialLaunchedIds = ref(new Set());

function generateYellowHue() {
  const hue = Math.floor(Math.random() * 23) + 36; // 36deg ~ 58deg
  return `${hue}deg`;
}

function formatTime(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  return d.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function sanitizeId(id) {
  return String(id).replace(/[.#$[\]/]/g, '_');
}

const app = createApp({
  setup() {
    const lanterns = ref([]);
    const selectedLantern = ref(null);
    const hudHidden = ref(false);
    let hudTimer = null;
    let isInitialLoadDone = false;
    let db = null;

    const isTransparent = computed(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get('transparent') === '1';
    });

    const wakeHud = () => {
      hudHidden.value = false;
      if (hudTimer) clearTimeout(hudTimer);
      hudTimer = setTimeout(() => {
        hudHidden.value = true;
      }, 3500);
    };

    const ensureSkyStyle = (item, isFromInitialLoad) => {
      if (skyStyleCache.has(item.id)) {
        return skyStyleCache.get(item.id);
      }

      const startX = (Math.random() * 82 + 4).toFixed(1);
      const duration = (Math.random() * 8 + 16).toFixed(1); // 16〜24秒
      const swayDuration = (Math.random() * 2.4 + 3.2).toFixed(1);
      const scale = (Math.random() * 0.35 + 0.82).toFixed(2);

      // 初期読み込み時は画面外下端からランダムな時間差で次々と飛び立つ
      const launchDuration = (Math.random() * 6 + 13).toFixed(1); // 13〜19秒
      const launchDelay = isFromInitialLoad
        ? (Math.random() * 5.5).toFixed(2) // 0〜5.5秒の間でバラバラに登場
        : '0.15';

      // ワープ防止のため定常ループは必ず0秒開始にし、下端からじんわり登場させる
      const loopDelay = '0s';

      const styleObj = {
        '--start-x': `${startX}%`,
        '--duration': `${duration}s`,
        '--launch-duration': `${launchDuration}s`,
        '--launch-delay': `${launchDelay}s`,
        '--loop-delay': `${loopDelay}`,
        '--sway-duration': `${swayDuration}s`,
        '--scale': scale,
      };

      skyStyleCache.set(item.id, styleObj);
      return styleObj;
    };

    const getSkyStyle = (item) => {
      return ensureSkyStyle(item, false);
    };

    const getWrapperClass = (id) => {
      if (initialLaunchedIds.value.has(id)) {
        return 'is-looping';
      }
      return 'is-initial';
    };

    const onWrapperAnimationEnd = (id, event) => {
      if (event.animationName === 'launchFromBelow') {
        const nextSet = new Set(initialLaunchedIds.value);
        nextSet.add(id);
        initialLaunchedIds.value = nextSet;
      }
    };

    const loadFromStorage = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            lanterns.value = parsed;
            parsed.slice(0, MAX_SKY_DISPLAY).forEach((item) => {
              ensureSkyStyle(item, true);
            });
          }
        }
      } catch (e) {
        console.error('履歴の読み込みに失敗しました:', e);
      }
    };

    const saveToStorage = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lanterns.value));
      } catch (e) {
        console.error('履歴の保存に失敗しました:', e);
      }
    };

    const applyRemoteLanterns = (raw) => {
      const entries = Object.entries(raw || {});
      const list = entries.map(([key, val]) => ({
        id: val.id || key,
        comment: val.comment || '',
        time: val.time || formatTime(val.timestamp),
        timestamp: val.timestamp || 0,
        hue: val.hue || generateYellowHue(),
      }));

      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const prevIds = new Set(lanterns.value.map((item) => item.id));
      const currentIds = new Set(list.map((item) => item.id));

      for (const cachedId of skyStyleCache.keys()) {
        if (!currentIds.has(cachedId)) {
          skyStyleCache.delete(cachedId);
        }
      }
      if (selectedLantern.value && !currentIds.has(selectedLantern.value.id)) {
        selectedLantern.value = null;
      }

      if (!isInitialLoadDone) {
        list.slice(0, MAX_SKY_DISPLAY).forEach((item) => {
          ensureSkyStyle(item, true);
        });
        isInitialLoadDone = true;
      } else {
        const nextLaunched = new Set(initialLaunchedIds.value);
        list.slice(0, MAX_SKY_DISPLAY).forEach((item) => {
          if (!prevIds.has(item.id)) {
            ensureSkyStyle(item, false);
            nextLaunched.add(item.id);
          }
        });
        initialLaunchedIds.value = nextLaunched;
      }

      lanterns.value = list;
      saveToStorage();
    };

    const registerLantern = (data) => {
      if (!data || !data.id) return;
      if (lanterns.value.some((item) => item.id === data.id)) return;

      const ts = data.timestamp || Date.now();
      const newItem = {
        id: data.id,
        comment: data.comment || '',
        time: formatTime(ts),
        timestamp: ts,
        hue: generateYellowHue(),
      };

      ensureSkyStyle(newItem, false);
      if (isInitialLoadDone) {
        const nextSet = new Set(initialLaunchedIds.value);
        nextSet.add(newItem.id);
        initialLaunchedIds.value = nextSet;
      }

      lanterns.value.unshift(newItem);
      saveToStorage();

      if (db) {
        const safeId = sanitizeId(newItem.id);
        set(dbRef(db, `lanterns/${safeId}`), newItem).catch((err) => {
          console.error('Firebaseへの保存に失敗しました:', err);
        });
      }
    };

    const skyLanterns = computed(() => {
      return lanterns.value.slice(0, MAX_SKY_DISPLAY);
    });

    onMounted(async () => {
      loadFromStorage();
      wakeHud();

      try {
        const fbApp = initializeApp(FIREBASE_CONFIG);
        db = getDatabase(fbApp);
        const lanternsRef = dbRef(db, 'lanterns');

        onValue(lanternsRef, (snapshot) => {
          applyRemoteLanterns(snapshot.val());
        });
      } catch (err) {
        console.error('Firebaseの初期化に失敗しました:', err);
        isInitialLoadDone = true;
      }

      if (typeof OneSDK !== 'undefined') {
        try {
          await OneSDK.setup({
            commentLimit: 100,
          });

          OneSDK.subscribe({
            action: 'comments',
            callback: (comments) => {
              comments.forEach((c) => {
                if (c && c.data) {
                  registerLantern(c.data);
                }
              });
            },
          });

          OneSDK.connect();
        } catch (err) {
          console.warn('OneSDK接続待機中またはオフラインモード:', err);
        }
      }
    });

    return {
      lanterns,
      selectedLantern,
      skyLanterns,
      isTransparent,
      hudHidden,
      wakeHud,
      getSkyStyle,
      getWrapperClass,
      onWrapperAnimationEnd,
    };
  },
});

app.mount('#archive-app');
