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

const app = createApp({
  setup() {
    const lanterns = ref([]);
    const selectedLantern = ref(null);
    const hudHidden = ref(false);
    let hudTimer = null;
    let isInitialLoadDone = false;

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
          lanterns.value = parsed;
          parsed.slice(0, MAX_SKY_DISPLAY).forEach((item) => {
            ensureSkyStyle(item, true);
          });
        }
      } catch (e) {
        console.error('履歴の読み込みに失敗しました:', e);
      } finally {
        isInitialLoadDone = true;
      }
    };

    const saveToStorage = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lanterns.value));
      } catch (e) {
        console.error('履歴の保存に失敗しました:', e);
      }
    };

    const registerLantern = (data) => {
      if (!data || !data.id) return;
      if (lanterns.value.some((item) => item.id === data.id)) return;

      const newItem = {
        id: data.id,
        comment: data.comment || '',
        time: formatTime(data.timestamp),
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
    };

    const skyLanterns = computed(() => {
      return lanterns.value.slice(0, MAX_SKY_DISPLAY);
    });

    onMounted(async () => {
      loadFromStorage();
      wakeHud();

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