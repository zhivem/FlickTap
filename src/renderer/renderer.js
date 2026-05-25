class MovieCatalogApp {
  constructor() {
    this.state = this.initializeState();
    this.constants = this.getConstants();
    this.playerConfig = this.getPlayerConfig();
    this.boundHandlers = new Map();
    this.imageCache = new Map();
    this.domCache = new Map();
    
    this.init();
  }

  // Оптимизированный доступ к элементам DOM с кэшированием
  getElement(id) {
    if (!this.domCache.has(id)) {
      this.domCache.set(id, document.querySelector(id));
    }
    return this.domCache.get(id);
  }

  // Очистка кэша DOM при необходимости
  invalidateDomCache() {
    this.domCache.clear();
  }

  initializeState() {
    return {
      currentMovies: [],
      currentPage: 1,
      totalPages: 1,
      totalMovies: 0,
      settings: {
        blockAds: true,
        autoStart: false,
        useKinopoiskPosters: true
      },
      isSearching: false,
      searchParams: {},
      currentMovie: null,
      newsTab: 'all',
      currentVersion: '1.0.0'
    };
  }

  getConstants() {
    return {
      GENRES_MAP: {
        6: 'Фэнтези', 7: 'Драма', 8: 'Мелодрама', 9: 'Приключения',
        10: 'Зарубежный', 11: 'Фантастика', 13: 'Триллер', 17: 'Боевик',
        19: 'Комедия', 22: 'Русский', 23: 'Спортивный', 24: 'Детектив',
        25: 'Криминал', 26: 'Ужасы', 27: 'Биографический', 28: 'Исторический',
        29: 'Вестерн', 32: 'Военный', 33: 'Семейный', 34: 'Полнометражный',
        36: 'Мистический', 37: 'Детский', 38: 'Мюзикл', 39: 'Арт-хаус',
        41: 'Блокбастер', 53: 'Короткометражный', 54: 'Документальный',
        55: 'Эротика', 72: 'Развлекательный', 106: 'Путешествия',
        107: 'Ток-шоу', 108: 'Реальное ТВ', 109: 'Музыка', 110: 'Sci-Fi'
      },
      TYPE_LABELS: {
        film: 'Фильм', series: 'Сериал', cartoon: 'Мультфильм',
        'cartoon-serials': 'Мультсериал', show: 'Шоу', anime: 'Аниме',
        'anime-serials': 'Аниме-сериал'
      },
      QUALITY_LABELS: { 0: '—', 1: 'HD', 2: 'TS', 3: 'SD', 4: 'FHD' },
      TYPE_MAPPINGS: {
        'tv-show': 'show', 'anime-film': 'anime',
        'cartoon-series': 'cartoon-serials', 'anime-series': 'anime-serials'
      }
    };
  }

  getPlayerConfig() {
    return {
      token: '28cc41f3030e53fee550388714566f4c',
      width: '100%',
      height: '100%'
    };
  }

  async init() {
    this.createLoadingOverlay();
    this.bindEvents();
    await this.loadVersion();
    await this.loadSettings();
    await this.loadMovies();
    
    // Check for updates in background (don't block initialization)
    this.checkForUpdates().catch(() => {});
  }

  createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <div class="loading-text">Загрузка...</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    document.body.appendChild(progressBar);
  }

  showGlobalLoading(show = true, text = 'Загрузка...') {
    const overlay = document.querySelector('.loading-overlay');
    const progressBar = document.querySelector('.progress-bar');
    const loadingText = document.querySelector('.loading-text');
    
    if (overlay && loadingText) {
      loadingText.textContent = text;
      if (show) {
        overlay.classList.add('active');
        progressBar.style.width = '30%';
      } else {
        overlay.classList.remove('active');
        progressBar.style.width = '100%';
        setTimeout(() => progressBar.style.width = '0%', 300);
      }
    }
  }

  bindEvents() {
    this.bindClickEvents();
    this.bindInputEvents();
    this.bindWindowEvents();
    this.bindSelectEvents();
    this.bindKeyboardEvents();
  }

  bindKeyboardEvents() {
    const escapeHandler = this.handleEscapeKey.bind(this);
    this.boundHandlers.set('escape', escapeHandler);
    document.addEventListener('keydown', escapeHandler);
  }

  handleEscapeKey(e) {
    if (e.key === 'Escape') {
      document.querySelector('.modal.active')?.classList.remove('active');
    }
  }

  bindClickEvents() {
    const globalClickHandler = this.handleGlobalClick.bind(this);
    this.boundHandlers.set('globalClick', globalClickHandler);
    document.addEventListener('click', globalClickHandler);

    const clickEvents = [
      ['#searchBtn', () => this.searchMovies()],
      ['#clearBtn', () => this.clearSearch()],
      ['#backBtn', () => this.showCatalog()],
      ['#prevPage', () => this.prevPage()],
      ['#nextPage', () => this.nextPage()],
      ['#settingsBtn', () => this.showModal('#settingsModal')],
      ['#clearCacheBtn', () => this.clearCache()],
      ['#newsAllTab', () => {
        this.setActiveNewsTab('all');
        this.loadMovies(1);
      }],
      ['#newsRecentTab', () => {
        this.setActiveNewsTab('recent');
        this.loadNews(1);
      }]
    ];

    clickEvents.forEach(([selector, handler]) => {
      const element = document.querySelector(selector);
      if (element) {
        const boundHandler = handler.bind(this);
        this.boundHandlers.set(selector, boundHandler);
        element.addEventListener('click', boundHandler);
      }
    });

    const windowControls = [
      ['#minimizeBtn', () => window.electronAPI.minimizeWindow()],
      ['#maximizeBtn', () => window.electronAPI.toggleMaximizeWindow()],
      ['#closeBtn', () => window.electronAPI.closeWindow()]
    ];

    windowControls.forEach(([selector, handler]) => {
      const element = document.querySelector(selector);
      if (element) {
        const boundHandler = handler.bind(this);
        this.boundHandlers.set(selector, boundHandler);
        element.addEventListener('click', boundHandler);
      }
    });
  }

  handleGlobalClick(e) {
    const movieCard = e.target.closest('.movie-card');
    if (movieCard) {
      const { kinopoiskId, imdbId } = movieCard.dataset;
      if (kinopoiskId || imdbId) this.handleMovieClick(kinopoiskId, imdbId);
      return;
    }

    const partItem = e.target.closest('.part-item');
    if (partItem) {
      const partId = partItem.dataset.id;
      if (partId) this.handlePartClick(partId);
      return;
    }

    if (e.target.classList.contains('modal')) {
      e.target.classList.remove('active');
    }
  }

  bindInputEvents() {
    const inputEvents = [
      ['#searchQuery', 'keypress', (e) => {
        if (e.key === 'Enter') this.searchMovies();
      }],
      ['#yearFilter', 'input', (e) => this.validateYearInput(e)],
      ['#blockAdsToggle', 'change', (e) => this.toggleBlockAds(e.target.checked)],
      ['#autoStartToggle', 'change', (e) => this.toggleAutoStart(e.target.checked)],
      ['#kinopoiskPostersToggle', 'change', (e) => this.toggleKinopoiskPosters(e.target.checked)]
    ];

    inputEvents.forEach(([selector, event, handler]) => {
      const element = document.querySelector(selector);
      if (element) {
        const boundHandler = handler.bind(this);
        this.boundHandlers.set(selector + event, boundHandler);
        element.addEventListener(event, boundHandler);
      }
    });

    // Theme radio buttons
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    themeRadios.forEach(radio => {
      const handler = (e) => this.changeTheme(e.target.value);
      const boundHandler = handler.bind(this);
      this.boundHandlers.set('theme-' + radio.value + 'change', boundHandler);
      radio.addEventListener('change', boundHandler);
    });

    ['#typeFilter', '#qualityFilter', '#genreFilter'].forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        const boundHandler = () => this.onFilterChange();
        this.boundHandlers.set(selector + 'change', boundHandler);
        element.addEventListener('change', boundHandler);
      }
    });
  }

  validateYearInput(e) {
    const input = e.target;
    input.value = input.value.replace(/\D/g, '');
    
    if (input.value.length > 4) {
      input.value = input.value.slice(0, 4);
    }
    
    const year = parseInt(input.value);
    if (year > 0 && (year < 1900 || year > 2030)) {
      input.style.borderColor = '#e74c3c';
    } else {
      input.style.borderColor = '';
    }
  }

  bindWindowEvents() {
    const maximizedHandler = () => {
      document.querySelector('#maximizeBtn')?.classList.add('maximized');
    };
    
    const unmaximizedHandler = () => {
      document.querySelector('#maximizeBtn')?.classList.remove('maximized');
    };

    this.boundHandlers.set('maximized', maximizedHandler);
    this.boundHandlers.set('unmaximized', unmaximizedHandler);

    window.electronAPI.onWindowMaximized(maximizedHandler);
    window.electronAPI.onWindowUnmaximized(unmaximizedHandler);
  }

  bindSelectEvents() {
    document.querySelectorAll('select').forEach(select => {
      const handler = function() {
        this.classList.toggle('has-value', !!this.value);
      };
      this.boundHandlers.set(select.id + 'change', handler);
      select.addEventListener('change', handler);
      if (select.value) select.classList.add('has-value');
    });
  }

  setActiveNewsTab(tab) {
    const allBtn = document.querySelector('#newsAllTab');
    const recentBtn = document.querySelector('#newsRecentTab');
    if (allBtn) allBtn.classList.toggle('active', tab === 'all');
    if (recentBtn) recentBtn.classList.toggle('active', tab === 'recent');
    this.state.newsTab = tab;
  }

  async loadNews(page = 1, limit = 20) {
    this.setLoadingState(true);
    try {
      const response = await window.electronAPI.getNews({ page, limit });
      if (!response || !response.success) {
        this.showError('Не удалось загрузить новости');
        this.displayEmptyState();
        return;
      }

      const items = response.data.results || response.data || [];

      // Deduplicate by `id` (show one entry per unique id)
      const seen = new Set();
      const unique = [];
      for (const it of items) {
        const key = String(it.id || it.kinopoisk_id || it.imdb_id || it.name || it.origin_name || it.iframe_url);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(it);
        }
      }

      this.displayNews(unique);

      // update pagination/info using API totals
      const total = parseInt(response.data.total || unique.length, 10) || unique.length;
      this.state.currentPage = page;
      this.state.totalMovies = total;
      this.state.totalPages = Math.max(1, Math.ceil(total / limit));
      this.updatePagination();
      this.updateStats();
    } catch (error) {
      this.showError(`Ошибка: ${error.message}`);
      this.displayEmptyState();
    } finally {
      this.setLoadingState(false);
    }
  }

  displayNews(items) {
    const container = document.querySelector('#moviesContainer');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `<div class="placeholder"><div class="placeholder-icon">Новости не найдены</div></div>`;
      return;
    }

    container.innerHTML = items.map(it => this.createNewsCard(it)).join('');
    // Enrich posters for items that lack them (background task with retry)
    this.enrichNewsPosters(items).catch(() => {});
  }

  async enrichNewsPosters(items) {
    if (!items || items.length === 0) return;

    // Process all items in parallel with batching to avoid overwhelming the API
    const CONCURRENCY = 10;
    const MAX_RETRIES = 2;
    const REQUEST_TIMEOUT = 6000;
    
    const allPromises = items.map(it => this.loadPosterForItem(it, MAX_RETRIES, REQUEST_TIMEOUT));
    
    // Process in batches
    for (let i = 0; i < allPromises.length; i += CONCURRENCY) {
      const batch = allPromises.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch);
    }
  }

  async loadPosterForItem(it, maxRetries, timeout) {
    const cacheKey = `poster_${it.id || it.kinopoisk_id || it.imdb_id}`;
    
    // Check if we have cached poster URL
    if (this.imageCache.has(cacheKey)) {
      const cachedUrl = this.imageCache.get(cacheKey);
      if (cachedUrl) {
        this.updatePosterInDOM(it, cachedUrl);
      }
      return;
    }

    const params = {};
    if (it.id) params.id = it.id;
    else if (it.kinopoisk_id) params.kinopoisk_id = it.kinopoisk_id;
    else if (it.imdb_id) params.imdb_id = it.imdb_id;
    else return;

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        );
        
        const res = await Promise.race([
          window.electronAPI.getMovieDetails(params),
          timeoutPromise
        ]);

        if (!res || !res.success || !res.data) {
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
            continue;
          }
          // Cache empty result to avoid repeated failed requests
          this.imageCache.set(cacheKey, '');
          return;
        }

        const detail = res.data;
        let candidate = '';
        
        if (this.state.settings.useKinopoiskPosters) {
          // Use official KinoPoisk poster (from Yandex MDS) or construct direct KinoPoisk URL
          candidate = detail.poster || detail.cover || detail.world_art || detail.poster_url || '';
          
          // If we have kinopoisk_id and no direct poster URL, construct proper KinoPoisk URL
          if ((!candidate || candidate.includes('world_art')) && (it.kinopoisk_id || detail.kinopoisk_id)) {
            const kpId = it.kinopoisk_id || detail.kinopoisk_id;
            if (kpId && kpId !== 'null') {
              // Construct direct KinoPoisk image URL from their server
              candidate = `https://st.kinopoisk.ru/images/film_big/${kpId}.jpg`;
            }
          }
        } else {
          candidate = detail.poster || detail.world_art || detail.poster_url || detail.cover || '';
        }

        // Cache the result
        this.imageCache.set(cacheKey, candidate || '');

        if (candidate && candidate !== 'null') {
          this.updatePosterInDOM(it, candidate);
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
          continue;
        }
      }
    }
  }

  updatePosterInDOM(item, posterUrl) {
    const selector = `.movie-card[data-id="${item.id || ''}"]`;
    let card = document.querySelector(selector);
    if (!card) {
      if (item.kinopoisk_id) card = document.querySelector(`.movie-card[data-kinopoisk-id="${item.kinopoisk_id}"]`);
      if (!card && item.imdb_id) card = document.querySelector(`.movie-card[data-imdb-id="${item.imdb_id}"]`);
    }

    if (card) {
      const img = card.querySelector('img.news-poster-img');
      const ph = card.querySelector('.poster-placeholder');
      if (img) {
        img.src = posterUrl;
        img.style.display = 'block';
        img.onerror = () => {
          img.style.display = 'none';
          if (ph) ph.style.display = 'flex';
        };
      }
      if (ph) ph.style.display = 'none';
    }
  }

  createNewsCard(item) {
    const poster = item.poster || '';
    const hasPoster = poster && poster !== 'null';
    const posterHtml = `
      <div class="poster-wrapper">
        <div class="poster-placeholder" style="display: ${hasPoster ? 'none' : 'flex'}">Нет постера</div>
        <img class="news-poster-img" data-card-id="${item.id || ''}" src="${hasPoster ? poster : ''}" alt="${item.name || item.origin_name}" loading="lazy" style="display: ${hasPoster ? 'block' : 'none'};" />
      </div>`;
    const year = item.year || '—';
    const quality = item.quality || '—';
    const iframeUrl = item.iframe_url || item.iframe || '';
    const hasVideo = iframeUrl && iframeUrl !== 'null' && iframeUrl !== 'none';

    return `
      <div class="movie-card" data-id="${item.id || ''}" data-kinopoisk-id="${item.kinopoisk_id || ''}" data-imdb-id="${item.imdb_id || ''}">
        <div class="movie-poster">${posterHtml}</div>
        <div class="movie-info">
          <div class="movie-title">${item.name || item.origin_name || 'Неизвестно'}</div>
          <div class="movie-meta-row"><span class="movie-year-tag">${year}</span> <span class="movie-quality-tag">${quality}</span></div>
          <div class="movie-description-short">${(item.description || item.slogan || '').slice(0, 140)}</div>
          <div class="movie-actions">${hasVideo ? '<span class="available">Видео доступно</span>' : '<span class="unavailable">Видео отсутствует</span>'}</div>
        </div>
      </div>
    `;
  }

  async handleMovieClick(kinopoiskId, imdbId) {
    this.showGlobalLoading(true, 'Загрузка фильма...');
    try {
      const searchParam = kinopoiskId && kinopoiskId !== 'null' ? 
        { kinopoisk_id: kinopoiskId } : 
        { imdb_id: imdbId };
      
      const response = await window.electronAPI.getMovieDetails(searchParam);
      if (response.success) {
        this.state.currentMovie = response.data;
        await this.populateMovieScreen();
      } else {
        this.showError('Не удалось загрузить детали фильма');
      }
    } catch (error) {
      this.showError(`Ошибка: ${error.message}`);
    } finally {
      this.showGlobalLoading(false);
    }
  }

  async handlePartClick(partId) {
    this.showGlobalLoading(true, 'Загрузка части франшизы...');
    try {
      const response = await window.electronAPI.getMovieDetails({ id: partId });
      if (response.success) {
        this.state.currentMovie = response.data;
        await this.populateMovieScreen();
      } else {
        this.showError('Не удалось загрузить часть франшизы');
      }
    } catch (error) {
      this.showError(`Ошибка: ${error.message}`);
    } finally {
      this.showGlobalLoading(false);
    }
  }

  isValidKinopoiskId(id) {
    return id && id !== 'null' && id !== '';
  }

  hasValidPlayerIds(movie) {
    return (this.isValidKinopoiskId(movie.kinopoisk_id) || 
            this.isValidKinopoiskId(movie.imdb_id));
  }

  async loadSettings() {
    try {
      this.state.settings = await window.electronAPI.getSettings();
      this.updateSettingsUI();
      // Apply theme on load
      this.applyTheme(this.state.settings.theme || 'dark');
    } catch (error) {
      this.showError('Не удалось загрузить настройки');
    }
  }

  async loadVersion() {
    try {
      const result = await window.electronAPI.getVersion();
      this.state.currentVersion = result.version;
      this.updateVersionUI();
    } catch (error) {
    }
  }

  updateVersionUI() {
    const versionSpan = document.getElementById('appVersion');
    if (versionSpan) {
      versionSpan.textContent = `Версия ${this.state.currentVersion}`;
    }
  }

  updateSettingsUI() {
    const settings = this.state.settings;
    const blockAdsToggle = document.querySelector('#blockAdsToggle');
    const autoStartToggle = document.querySelector('#autoStartToggle');
    const kinopoiskPostersToggle = document.querySelector('#kinopoiskPostersToggle');

    if (blockAdsToggle) {
      blockAdsToggle.checked = !!settings.blockAds;
    }
    if (autoStartToggle) {
      autoStartToggle.checked = !!settings.autoStart;
    }
    if (kinopoiskPostersToggle) {
      kinopoiskPostersToggle.checked = !!settings.useKinopoiskPosters;
    }

    // Update theme selector
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    const currentTheme = settings.theme || 'dark';
    themeRadios.forEach(radio => {
      radio.checked = radio.value === currentTheme;
    });
  }

  async toggleBlockAds(enabled) {
    try {
      await window.electronAPI.setBlockAds(enabled);
      this.state.settings.blockAds = enabled;
      this.showToast(enabled ? 'Реклама заблокирована' : 'Реклама включена');
    } catch (error) {
      const blockAdsToggle = document.querySelector('#blockAdsToggle');
      if (blockAdsToggle) blockAdsToggle.checked = !enabled;
      this.showError('Ошибка сохранения настроек');
    }
  }

  async toggleAutoStart(enabled) {
    try {
      await window.electronAPI.setAutoStart(enabled);
      this.state.settings.autoStart = enabled;
      this.showToast(enabled ? 'Автозапуск включен' : 'Автозапуск выключен');
    } catch (error) {
      document.querySelector('#autoStartToggle').checked = !enabled;
      this.showError('Ошибка сохранения настроек автозапуска');
    }
  }

  async toggleKinopoiskPosters(enabled) {
    try {
      await window.electronAPI.setKinopoiskPosters(enabled);
      this.state.settings.useKinopoiskPosters = enabled;
      this.showToast(enabled ? 'Постеры с Кинопоиска включены' : 'Постеры с балансера включены');
      
      // Clear poster cache to force reload with new source
      this.imageCache.clear();
      
      // Force reload all images with new poster source
      const newsCards = document.querySelectorAll('.movie-card');
      newsCards.forEach(card => {
        const img = card.querySelector('img.news-poster-img');
        const placeholder = card.querySelector('.poster-placeholder');
        if (img) {
          // Reset image to reload from new source
          img.src = '';
          img.style.display = 'none';
        }
        if (placeholder) {
          placeholder.style.display = 'flex';
        }
      });
      
      // Перезагружаем текущую страницу новостей с новыми постерами
      await this.loadNews(this.state.currentPage);
    } catch (error) {
      document.querySelector('#kinopoiskPostersToggle').checked = !enabled;
      this.showError('Ошибка сохранения настроек постеров');
    }
  }

  async clearCache() {
    try {
      await window.electronAPI.clearCache();
      this.imageCache.clear();
      this.showToast('Кэш очищен');
    } catch (error) {
      this.showError('Ошибка очистки кэша');
    }
  }

  async changeTheme(theme) {
    try {
      await window.electronAPI.setTheme(theme);
      this.state.settings.theme = theme;
      this.applyTheme(theme);
      const themeNames = { light: 'Светлая', dark: 'Темная', system: 'Системная' };
      this.showToast(`Тема: ${themeNames[theme]}`);
    } catch (error) {
      this.showError('Ошибка смены темы');
      this.updateSettingsUI();
    }
  }

  applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'system') {
      // Determine system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        html.classList.remove('light-theme');
      } else {
        html.classList.add('light-theme');
      }
      
      // Listen for system theme changes when in system mode
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => {
        document.documentElement.classList.toggle('light-theme', !e.matches);
      };
      
      // Remove existing listener if any
      const oldHandler = this.boundHandlers.get('systemThemeListener');
      if (oldHandler && darkModeQuery.removeEventListener) {
        darkModeQuery.removeEventListener('change', oldHandler);
      }
      
      if (darkModeQuery.addEventListener) {
        darkModeQuery.addEventListener('change', handler);
        this.boundHandlers.set('systemThemeListener', handler);
      }
    } else if (theme === 'light') {
      html.classList.add('light-theme');
      
      // Remove system theme listener
      const handler = this.boundHandlers.get('systemThemeListener');
      if (handler) {
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        if (darkModeQuery.removeEventListener) {
          darkModeQuery.removeEventListener('change', handler);
        }
        this.boundHandlers.delete('systemThemeListener');
      }
    } else {
      // dark theme
      html.classList.remove('light-theme');
      
      // Remove system theme listener
      const handler = this.boundHandlers.get('systemThemeListener');
      if (handler) {
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        if (darkModeQuery.removeEventListener) {
          darkModeQuery.removeEventListener('change', handler);
        }
        this.boundHandlers.delete('systemThemeListener');
      }
    }
  }

  onFilterChange() {
    if (this.state.isSearching) {
      this.searchMovies();
    }
  }

  getSearchParams() {
    const params = {};
    const qEl = document.querySelector('#searchQuery');
    const q = qEl?.value?.trim();
    if (q) {
      if (/^\d+$/.test(q)) {
        params.kinopoisk_id = q;
      } else {
        params.name = q;
      }
    }

    const type = document.querySelector('#typeFilter')?.value?.trim();
    const quality = document.querySelector('#qualityFilter')?.value?.trim();
    const year = document.querySelector('#yearFilter')?.value?.trim();
    const genre = document.querySelector('#genreFilter')?.value?.trim();

    if (type) params.type = type;
    if (quality) params.quality = quality;
    if (year) params.year = year;
    if (genre) params.genre_id = genre;

    return params;
  }

  async loadMovies(page = 1) {
    this.setLoadingState(true);
    this.state.isSearching = false;

    try {
      const response = await window.electronAPI.getMovieList({ page, limit: 12 });
      this.handleApiResponse(response, page);
    } catch (error) {
      this.showError(`Ошибка: ${error.message}`);
      this.displayEmptyState();
    } finally {
      this.setLoadingState(false);
    }
  }

  async searchMovies() {
    const params = this.getSearchParams();
    this.state.searchParams = params;
    this.state.isSearching = Object.keys(params).length > 0;

    if (this.state.isSearching) {
      this.setLoadingState(true);

      try {
        const response = await window.electronAPI.getMovieList({ ...params, page: 1, limit: 12 });
        this.handleApiResponse(response, 1);
      } catch (error) {
        this.showError(`Ошибка: ${error.message}`);
        this.displayEmptyState();
      } finally {
        this.setLoadingState(false);
      }
    } else {
      await this.loadMovies(1);
    }
  }

  setLoadingState(loading) {
    const btn = document.querySelector('#searchBtn');
    if (!btn) return;

    const textSpan = btn.querySelector('.btn-text');
    const loadingSpan = btn.querySelector('.btn-loading');
    btn.disabled = loading;
    
    if (textSpan) textSpan.style.display = loading ? 'none' : 'inline';
    if (loadingSpan) loadingSpan.style.display = loading ? 'inline' : 'none';

    if (loading) {
      this.showSkeletonLoading();
    }
  }

  handleApiResponse(response, page) {
    if (!response.success) {
      this.showError(`Ошибка: ${response.error}`);
      this.displayEmptyState();
      return;
    }

    this.state.currentMovies = response.data.results || [];
    this.state.totalMovies = response.data.total || 0;
    this.state.currentPage = page;
    this.state.totalPages = Math.ceil(this.state.totalMovies / 12) || 1;

    this.displayMovies(this.state.currentMovies);
    this.updatePagination();
    this.updateStats();
  }

  showSkeletonLoading() {
    const container = document.querySelector('#moviesContainer');
    if (!container) return;

    const skeletonHTML = Array(6).fill(`
      <div class="movie-card">
        <div class="movie-poster">
          <div class="skeleton skeleton-poster"></div>
        </div>
        <div class="movie-info">
          <div class="skeleton skeleton-text short"></div>
          <div class="skeleton skeleton-text medium"></div>
          <div class="skeleton skeleton-text" style="width: 40%;"></div>
        </div>
      </div>
    `).join('');

    container.innerHTML = skeletonHTML;
  }

  displayMovies(movies) {
    const container = document.querySelector('#moviesContainer');
    if (!container) return;

    if (movies?.length) {
      container.innerHTML = movies.map(movie => this.createMovieCard(movie)).join('');
    } else {
      this.displayEmptyState();
    }
  }

  createMovieCard(movie) {
    const hasPoster = movie.poster && movie.poster !== 'null';
    const posterSrc = hasPoster ? movie.poster : '';
    const posterPlaceholder = !hasPoster ? '<div class="poster-placeholder">Нет постера</div>' : '';

    const yearTag = movie.year ? `<span class="movie-year-tag">${movie.year}</span>` : '';
    const kpTag = movie.kinopoisk ? `<span class="rating-kp-tag">КП ${this.formatRating(movie.kinopoisk)}</span>` : '';
    const imdbTag = movie.imdb ? `<span class="rating-imdb-tag">IMDb ${this.formatRating(movie.imdb)}</span>` : '';
    const typeTag = movie.type ? `<span class="movie-type-tag">${this.getTypeLabel(movie.type)}</span>` : '';
    const qualityTag = movie.quality ? `<span class="movie-quality-tag">${this.getQualityLabel(movie.quality)}</span>` : '';

    const genreTags = movie.genre ? Object.values(movie.genre).map(genre => 
      `<span class="movie-genre-tag">${genre}</span>`
    ).join('') : '';

    return `
      <div class="movie-card" data-kinopoisk-id="${movie.kinopoisk_id || ''}" data-imdb-id="${movie.imdb_id || ''}" data-id="${movie.id}">
        <div class="movie-poster">
          ${posterPlaceholder}
          <img src="${posterSrc}" alt="${movie.name || movie.name_eng}" loading="lazy" style="display: ${hasPoster ? 'block' : 'none'};">
        </div>
        <div class="movie-info">
          <div class="movie-title">${movie.name || movie.name_eng || 'Неизвестно'}</div>
          ${movie.name && movie.name !== movie.name_eng ? `<div class="movie-title-en">${movie.name_eng || ''}</div>` : ''}
          <div class="movie-meta-row">
            ${yearTag} ${kpTag} ${imdbTag} ${typeTag} ${qualityTag}
          </div>
          ${genreTags ? `<div class="movie-genres-row">${genreTags}</div>` : ''}
        </div>
      </div>
    `;
  }

  async populateMovieScreen() {
    this.fillMovieInfo(this.state.currentMovie);
    this.initializePlayer();
    this.showMovieScreen();
    this.hidePartsSection();

    if (this.state.currentMovie?.parts && this.state.currentMovie.parts.length > 1) {
      await this.loadPartsSection(this.state.currentMovie.parts);
    }
  }

  async loadPartsSection(parts) {
    const currentId = this.state.currentMovie.id;
    const otherParts = parts.filter(id => parseInt(id) !== parseInt(currentId));

    if (otherParts.length === 0) {
      this.hidePartsSection();
      return;
    }

    this.showGlobalLoading(true, 'Загрузка частей франшизы...');

    try {
      const responses = await Promise.all(
        otherParts.slice(0, 10).map(id => window.electronAPI.getMovieDetails({ id }))
      );

      const partsList = document.querySelector('#partsList');
      if (!partsList) return;

      const validParts = responses
        .filter(resp => resp.success && resp.data)
        .map(resp => resp.data)
        .sort((a, b) => (a.year || 0) - (b.year || 0));

      if (validParts.length === 0) {
        this.hidePartsSection();
        return;
      }

      partsList.innerHTML = validParts.map(part => `
        <div class="part-item" data-id="${part.id}" data-kinopoisk-id="${part.kinopoisk_id}">
          <span class="part-name">${part.name || part.name_eng || 'Неизвестно'}</span>
          <span class="part-year">${part.year || '—'}</span>
        </div>
      `).join('');

      document.querySelector('#partsSection').style.display = 'block';
    } catch (error) {
      this.hidePartsSection();
    } finally {
      this.showGlobalLoading(false);
    }
  }

  loadMainPlayer() {
    const player = document.querySelector('#mainVideoPlayer');
    if (!player || !this.state.currentMovie) return;

    player.src = '';

    // Используем iframe_url из API
    const iframeUrl = this.state.currentMovie.iframe_url;

    // Проверяем доступность видео
    if (!iframeUrl || iframeUrl === 'null' || iframeUrl === 'none') {
      this.showError('Видеофайл для этого фильма еще недоступен');
      player.src = 'about:blank';
      return;
    }

    // Загружаем плеер с параметрами
    setTimeout(() => {
      player.src = iframeUrl + '?autoplay=1&muted=0&theme=4'; 
    }, 120);
  }

  initializePlayer() {
    this.loadMainPlayer();
  }

  showMovieScreen() {
    const mainPlayer = this.getElement('#mainVideoPlayer');
    if (mainPlayer) mainPlayer.src = '';

    const catalogScreen = this.getElement('#catalogScreen');
    const movieScreen = this.getElement('#movieScreen');
    const backBtn = this.getElement('#backBtn');

    if (catalogScreen) catalogScreen.classList.remove('active');
    if (movieScreen) movieScreen.classList.add('active');
    if (backBtn) backBtn.style.setProperty('display', 'block', 'important');
  }

  showCatalog() {
    const mainPlayer = this.getElement('#mainVideoPlayer');
    if (mainPlayer) mainPlayer.src = '';

    this.state.currentMovie = null;
    this.imageCache.clear();

    const movieScreen = this.getElement('#movieScreen');
    const catalogScreen = this.getElement('#catalogScreen');
    const backBtn = this.getElement('#backBtn');

    if (movieScreen) movieScreen.classList.remove('active');
    if (catalogScreen) catalogScreen.classList.add('active');
    if (backBtn) backBtn.style.setProperty('display', 'none', 'important');
    this.hidePartsSection();
  }

  showModal(selector) {
    document.querySelector(selector)?.classList.add('active');
  }

  fillMovieInfo(movie) {
    const infoMap = {
      moviePlayerTitle: movie.name || movie.name_eng || 'Неизвестно',
      originalTitle: movie.name_eng || movie.name || '—',
      moviePlayerYear: movie.year || '—',
      moviePlayerQuality: this.getQualityLabel(movie.quality),
      moviePlayerAge: movie.age || '—',
      moviePlayerType: this.getTypeLabel(movie.type),
      moviePlayerKp: `КП: ${this.formatRating(movie.kinopoisk) || '—'}`,
      moviePlayerImdb: `IMDb: ${this.formatRating(movie.imdb) || '—'}`,
      moviePlayerDescription: movie.description || 'Описание отсутствует',
      movieGenre: this.formatObject(movie.genre),
      movieCountry: this.formatObject(movie.country),
      movieDirector: this.formatObject(movie.director),
      movieActors: this.formatObject(movie.actors),
      movieDuration: movie.time || '—',
      movieBudget: this.formatMoney(movie.budget),
      movieFeesWorld: this.formatMoney(movie.fees_world),
      movieFeesUsa: this.formatMoney(movie.fees_use),
      movieFeesRus: this.formatMoney(movie.fees_rus),
      moviePremier: movie.premier || '—',
      moviePremierRus: movie.premier_rus || '—'
    };

    // Batch DOM-операции в одном цикле
    const updates = [];
    for (const [id, value] of Object.entries(infoMap)) {
      const element = document.querySelector(`#${id}`);
      if (element) {
        updates.push({ element, value });
      }
    }

    // Применить обновления
    updates.forEach(({ element, value }) => {
      element.textContent = value;
    });

    // Обновить постер и категории
    const posterImg = document.querySelector('#posterImage');
    if (posterImg) {
      const hasPoster = movie.poster && movie.poster !== 'null';
      posterImg.src = hasPoster ? movie.poster : '';
      posterImg.style.display = hasPoster ? 'block' : 'none';
    }

    const categoryTags = document.querySelector('#categoryTags');
    if (categoryTags) {
      categoryTags.innerHTML = movie.rate_mpaa ? `<span class="category-tag">${movie.rate_mpaa}</span>` : '';
    }
  }

  formatRating(rating) {
    if (!rating || rating === 'null') return null;
    const num = parseFloat(rating);
    return isNaN(num) ? null : num.toFixed(1);
  }

  getQualityLabel(quality) {
    return this.constants.QUALITY_LABELS[quality] || quality || '—';
  }

  normalizeType(type) {
    if (!type) return type;
    return this.constants.TYPE_MAPPINGS[type] || type;
  }

  getTypeLabel(type) {
    const normalizedType = this.normalizeType(type);
    return this.constants.TYPE_LABELS[normalizedType] || normalizedType || '—';
  }

  formatMoney(value) {
    if (!value || value === 'null' || typeof value !== 'string') return '—';
    const match = value.match(/[\d\s.,]+(?=\s*[$€₽]?)/g);
    if (!match) return '—';

    const numStr = match[match.length - 1].replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(numStr);
    return isNaN(num) ? '—' : new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(num);
  }

  formatObject(obj) {
    if (!obj || typeof obj !== 'object') return '—';
    const values = Object.values(obj).filter(val => val && val !== 'null');
    return values.length ? values.join(', ') : '—';
  }

  prevPage() {
    if (this.state.currentPage > 1) {
      if (this.state.newsTab === 'recent') {
        this.loadNews(this.state.currentPage - 1);
      } else {
        this.loadPage(this.state.currentPage - 1);
      }
    }
  }

  nextPage() {
    if (this.state.currentPage < this.state.totalPages) {
      if (this.state.newsTab === 'recent') {
        this.loadNews(this.state.currentPage + 1);
      } else {
        this.loadPage(this.state.currentPage + 1);
      }
    }
  }

  async loadPage(page) {
    const params = this.state.isSearching ? 
      { ...this.state.searchParams, page, limit: 12 } : 
      { page, limit: 12 };
    
    const response = await window.electronAPI.getMovieList(params);
    this.handleApiResponse(response, page);
  }

  updatePagination() {
    const prevBtn = document.querySelector('#prevPage');
    const nextBtn = document.querySelector('#nextPage');
    const pageNum = document.querySelector('#pageNumber');

    if (prevBtn) prevBtn.disabled = this.state.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = this.state.currentPage >= this.state.totalPages;
    if (pageNum) pageNum.textContent = this.state.currentPage;
  }

  updateStats() {
    const totalMoviesEl = document.querySelector('#totalMovies');
    const currentPageEl = document.querySelector('#currentPage');

    if (totalMoviesEl) totalMoviesEl.textContent = this.state.totalMovies.toLocaleString();
    if (currentPageEl) currentPageEl.textContent = this.state.currentPage;
  }

  displayEmptyState() {
    const container = document.querySelector('#moviesContainer');
    if (container) {
      container.innerHTML = `
        <div class="placeholder">
          <div class="placeholder-icon">🎬</div>
          <div class="placeholder-text">Фильмы не найдены. Попробуйте изменить поисковый запрос.</div>
        </div>
      `;
    }
  }

  validateIdInput(event) {
    const input = event.target;
    const validationEl = document.querySelector('#idValidation');
    if (!input || !validationEl) return;

    const numericValue = input.value.replace(/\D/g, '');
    if (numericValue !== input.value) {
      input.value = numericValue;
    }
    validationEl.textContent = numericValue ? 'Ввод только цифр' : '';
  }

  clearSearch() {
    ['#searchQuery', '#yearFilter', '#genreFilter'].forEach(selector => {
      const element = document.querySelector(selector);
      if (element) element.value = '';
    });
    ['#typeFilter', '#qualityFilter'].forEach(selector => {
      const element = document.querySelector(selector);
      if (element) element.value = '';
    });
    
    const validationEl = document.querySelector('#idValidation');
    if (validationEl) validationEl.textContent = '';
    
    this.state.searchParams = {};
    this.state.isSearching = false;
    this.loadMovies(1);
  }

  hidePartsSection() {
    const partsSection = document.querySelector('#partsSection');
    if (partsSection) {
      partsSection.style.display = 'none';
    }
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  showError(message) {
    this.showToast(`Ошибка: ${message}`);
  }

  async checkForUpdates() {
    try {
      const result = await window.electronAPI.checkUpdates();
      if (result && result.hasUpdate) {
        this.showUpdateModal(result.currentVersion, result.remoteVersion);
      }
    } catch (error) {
    }
  }

  showUpdateModal(currentVersion, remoteVersion) {
    const modal = document.getElementById('updateModal');
    const currentVersionSpan = document.getElementById('currentVersionSpan');
    const remoteVersionSpan = document.getElementById('remoteVersionSpan');

    if (currentVersionSpan) currentVersionSpan.textContent = currentVersion;
    if (remoteVersionSpan) remoteVersionSpan.textContent = remoteVersion;

    if (modal) {
      modal.classList.add('active');
    }
  }

  openReleases() {
    window.electronAPI.openExternal('https://github.com/zhivem/FlickTap/releases');
  }

  destroy() {
    for (const [key, handler] of this.boundHandlers.entries()) {
      if (key === 'escape') {
        document.removeEventListener('keydown', handler);
      } else if (key === 'globalClick') {
        document.removeEventListener('click', handler);
      } else if (key.startsWith('#')) {
        const [selector, event] = key.includes('change') ? 
          [key.split('change')[0], 'change'] : 
          [key, 'click'];
        const element = document.querySelector(selector);
        if (element) {
          element.removeEventListener(event, handler);
        }
      }
    }
    this.boundHandlers.clear();

    const overlay = document.querySelector('.loading-overlay');
    const progressBar = document.querySelector('.progress-bar');
    overlay?.remove();
    progressBar?.remove();

    this.state.currentMovies = [];
    this.state.currentMovie = null;
    this.imageCache.clear();
  }
}

const movieApp = new MovieCatalogApp();
window.app = movieApp;

window.addEventListener('beforeunload', () => {
  movieApp?.destroy();
});