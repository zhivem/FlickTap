class MovieCatalogApp {
  constructor() {
    this.state = this.initializeState();
    this.constants = this.getConstants();
    this.playerConfig = this.getPlayerConfig();
    this.boundHandlers = new Map();
    this.imageCache = new Map();
    
    this.init();
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
        highQualityPosters: false,
        useTmdbDescriptions: true
      },
      isSearching: false,
      searchParams: {},
      currentMovie: null,
      currentPlayer: 'main'
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
      },
      TMDB_MEDIA_TYPES: {
        'film': 'movie', 'series': 'tv', 'cartoon': 'movie',
        'cartoon-serials': 'tv', 'show': 'tv', 'anime': 'movie',
        'anime-serials': 'tv', 'tv-show': 'tv', 'anime-film': 'movie',
        'cartoon-series': 'tv', 'anime-series': 'tv'
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
    await this.loadSettings();
    await this.loadMovies();
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
      ['#player1Btn', () => this.switchPlayer('main')],
      ['#player2Btn', () => this.switchPlayer('alternative')],
      ['#settingsBtn', () => this.showModal('#settingsModal')],
      ['#openFramerateLink', (e) => {
        e.preventDefault();
        window.electronAPI.openExternalUrl('https://framerate.live');
      }],
      ['#clearCacheBtn', () => this.clearCache()]
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
      ['#movieTitle', 'keypress', (e) => {
        if (e.key === 'Enter') this.searchMovies();
      }],
      ['#kinopoiskId', 'input', (e) => this.validateIdInput(e)],
      ['#yearFilter', 'input', (e) => this.validateYearInput(e)],
      ['#blockAdsToggle', 'change', (e) => this.toggleBlockAds(e.target.checked)],
      ['#autoStartToggle', 'change', (e) => this.toggleAutoStart(e.target.checked)],
      ['#highQualityPostersToggle', 'change', (e) => this.toggleHighQualityPosters(e.target.checked)],
      ['#useTmdbDescriptionsToggle', 'change', (e) => this.toggleUseTmdbDescriptions(e.target.checked)]
    ];

    inputEvents.forEach(([selector, event, handler]) => {
      const element = document.querySelector(selector);
      if (element) {
        const boundHandler = handler.bind(this);
        this.boundHandlers.set(selector + event, boundHandler);
        element.addEventListener(event, boundHandler);
      }
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
    } catch (error) {
      this.showError('Не удалось загрузить настройки');
    }
  }

  updateSettingsUI() {
    const settings = this.state.settings;
    document.querySelector('#blockAdsToggle').checked = settings.blockAds;
    document.querySelector('#autoStartToggle').checked = settings.autoStart;
    document.querySelector('#highQualityPostersToggle').checked = settings.highQualityPosters;
    document.querySelector('#useTmdbDescriptionsToggle').checked = settings.useTmdbDescriptions;
  }

  async toggleBlockAds(enabled) {
    try {
      await window.electronAPI.setBlockAds(enabled);
      this.state.settings.blockAds = enabled;
      this.showToast(enabled ? 'Реклама заблокирована' : 'Реклама включена');
    } catch (error) {
      document.querySelector('#blockAdsToggle').checked = !enabled;
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

  async toggleHighQualityPosters(enabled) {
    try {
      await window.electronAPI.setHighQualityPosters(enabled);
      this.state.settings.highQualityPosters = enabled;
      this.showToast(enabled ? 'Качественные постеры включены' : 'Качественные постеры выключены');
      
      if (this.state.currentMovies.length > 0) {
        await this.loadMoviePosters(this.state.currentMovies);
      }
      
      if (this.state.currentMovie && enabled) {
        await this.loadHighQualityMoviePoster();
      }
    } catch (error) {
      document.querySelector('#highQualityPostersToggle').checked = !enabled;
      this.showError('Ошибка сохранения настроек постеров');
    }
  }

  async toggleUseTmdbDescriptions(enabled) {
    try {
      await window.electronAPI.setUseTmdbDescriptions(enabled);
      this.state.settings.useTmdbDescriptions = enabled;
      
      this.showToast(enabled ? 'Описания с TMDB включены' : 'Описания с TMDB выключены');
      
      if (this.state.currentMovie && this.state.settings.useTmdbDescriptions) {
        this.loadEnhancedDescription();
      }
    } catch (error) {
      document.querySelector('#useTmdbDescriptionsToggle').checked = !enabled;
      this.showError('Ошибка сохранения настроек описаний');
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

  onFilterChange() {
    if (this.state.isSearching) {
      this.searchMovies();
    }
  }

  getSearchParams() {
    const paramMap = {
      name: '#movieTitle',
      kinopoisk_id: '#kinopoiskId',
      type: '#typeFilter',
      quality: '#qualityFilter',
      year: '#yearFilter',
      genre_id: '#genreFilter'
    };

    const params = {};
    Object.entries(paramMap).forEach(([key, selector]) => {
      const element = document.querySelector(selector);
      const value = element?.value?.trim();
      if (value) params[key] = value;
    });
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

    if (this.state.settings.highQualityPosters) {
      this.loadMoviePosters(this.state.currentMovies);
    }
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

  async loadMoviePosters(movies) {
    if (!this.state.settings.highQualityPosters) return;

    const posterPromises = movies.map(async (movie, index) => {
      if (!movie.kinopoisk_id) return;

      try {
        const mediaType = this.constants.TMDB_MEDIA_TYPES[movie.type] || 'movie';
        const response = await window.electronAPI.getTmdbPoster({
          kinopoiskId: movie.kinopoisk_id,
          mediaType: mediaType
        });

        if (response.success && response.data.posterUrl) {
          await this.preloadImage(response.data.posterUrl);
          this.updateMoviePoster(index, response.data.posterUrl);
        }
      } catch (error) {
        console.warn(`TMDB poster failed for ${movie.kinopoisk_id}:`, error);
      }
    });

    await Promise.allSettled(posterPromises);
  }

  async loadHighQualityMoviePoster() {
    if (!this.state.currentMovie?.kinopoisk_id || !this.state.settings.highQualityPosters) {
      return;
    }

    try {
      const mediaType = this.constants.TMDB_MEDIA_TYPES[this.state.currentMovie.type] || 'movie';
      const response = await window.electronAPI.getTmdbPoster({
        kinopoiskId: this.state.currentMovie.kinopoisk_id,
        mediaType: mediaType
      });

      if (response.success && response.data.posterUrl) {
        await this.preloadImage(response.data.posterUrl);
        this.updateCurrentMoviePoster(response.data.posterUrl);
      }
    } catch (error) {
      console.warn('Failed to load high quality movie poster:', error);
    }
  }

  preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  updateMoviePoster(index, posterUrl) {
    if (!posterUrl) return;

    const movieCard = document.querySelectorAll('.movie-card')[index];
    if (!movieCard) return;

    const posterImg = movieCard.querySelector('.movie-poster img');
    const placeholder = movieCard.querySelector('.poster-placeholder');
    
    if (posterImg) {
      posterImg.style.opacity = '0';
      posterImg.style.transition = 'opacity 0.3s ease';
      
      setTimeout(() => {
        posterImg.src = posterUrl;
        posterImg.style.display = 'block';
        
        setTimeout(() => {
          posterImg.style.opacity = '1';
        }, 50);
      }, 100);
    }
    
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }

  updateCurrentMoviePoster(posterUrl) {
    if (!posterUrl) return;

    const posterImg = document.querySelector('#posterImage');
    if (!posterImg) return;

    posterImg.style.opacity = '0';
    posterImg.style.transition = 'opacity 0.3s ease';
    
    setTimeout(() => {
      posterImg.src = posterUrl;
      posterImg.style.display = 'block';
      
      setTimeout(() => {
        posterImg.style.opacity = '1';
      }, 50);
    }, 100);
  }

  async loadEnhancedDescription() {
    if (!this.state.currentMovie?.kinopoisk_id || 
        !this.state.settings.useTmdbDescriptions) {
      return;
    }

    try {
      const mediaType = this.constants.TMDB_MEDIA_TYPES[this.state.currentMovie.type] || 'movie';
      const response = await window.electronAPI.getTmdbDescription({
        kinopoiskId: this.state.currentMovie.kinopoisk_id,
        mediaType: mediaType
      });

      if (response.success && response.data.description) {
        this.updateMovieDescription(response.data.description, 'tmdb');
      }
    } catch (error) {
      console.warn('Failed to load TMDB description:', error);
    }
  }

  updateMovieDescription(description, source) {
    const descriptionElement = document.querySelector('#moviePlayerDescription');
    const sourceElement = document.querySelector('#descriptionSource');
    
    if (descriptionElement) {
      descriptionElement.style.opacity = '0.7';
      setTimeout(() => {
        descriptionElement.textContent = description;
        descriptionElement.style.opacity = '1';
      }, 300);
    }

    if (sourceElement) {
      sourceElement.style.display = source === 'tmdb' ? 'inline' : 'none';
    }
  }

  async populateMovieScreen() {
    this.fillMovieInfo(this.state.currentMovie);
    this.switchPlayer(this.state.currentPlayer);
    this.showMovieScreen();
    this.hidePartsSection();

    if (this.state.settings.highQualityPosters) {
      await this.loadHighQualityMoviePoster();
    }

    if (this.state.settings.useTmdbDescriptions) {
      this.loadEnhancedDescription();
    }

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

    let url = '';
    const kp = this.state.currentMovie.kinopoisk_id;
    const imdb = this.state.currentMovie.imdb_id;

    if (kp && kp !== 'null' && kp !== '0') {
      url = `https://api.namy.ws/embed/kp/${kp}`;
    } else if (imdb && imdb !== 'null' && imdb !== '0') {
      url = `https://api.namy.ws/embed/imdb/${imdb}`;
    }

    if (url) {
      setTimeout(() => {
        player.src = url + '?autoplay=1&muted=0'; 
        console.log('Основной плеер загружен:', url);
      }, 120);
    } else {
      console.warn('Не удалось сформировать URL плеера: нет kinopoisk_id и imdb_id');
      player.src = 'about:blank';
    }
  }

  loadAlternativePlayer() {
    if (!this.state.currentMovie?.kinopoisk_id) return;

    const container = document.querySelector('#alternativeIframeContainer');
    if (!container) return;

    container.innerHTML = '<div id="alternativeIframe"></div>';

    setTimeout(() => {
      try {
        if (typeof window.addtoiframe === 'function') {
          window.addtoiframe(
            'alternativeIframe',
            this.state.currentMovie.kinopoisk_id,
            '100%',
            '100%',
            this.playerConfig.token
          );
        }
      } catch (err) {
        console.error('Ошибка альтернативного плеера:', err);
      }
    }, 250);
  }

  switchPlayer(playerType) {
    this.state.currentPlayer = playerType;

    document.querySelectorAll('.player-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-player="${playerType}"]`)?.classList.add('active');

    document.querySelectorAll('.player-container').forEach(c => c.classList.remove('active'));
    document.querySelector(playerType === 'main' ? '#mainPlayer' : '#alternativePlayer')?.classList.add('active');

    if (playerType === 'main') {
      this.loadMainPlayer();
    } else {
      this.loadAlternativePlayer();
    }
  }

  showMovieScreen() {
    const mainPlayer = document.querySelector('#mainVideoPlayer');
    if (mainPlayer) mainPlayer.src = '';

    const altContainer = document.querySelector('#alternativeIframeContainer');
    if (altContainer) altContainer.innerHTML = '';

    document.querySelector('#catalogScreen')?.classList.remove('active');
    document.querySelector('#movieScreen')?.classList.add('active');
    document.querySelector('#backBtn')?.style.setProperty('display', 'block', 'important');
  }

  showCatalog() {
    const mainPlayer = document.querySelector('#mainVideoPlayer');
    if (mainPlayer) {
      mainPlayer.src = '';
    }

    const altContainer = document.querySelector('#alternativeIframeContainer');
    if (altContainer) altContainer.innerHTML = '';

    this.state.currentMovie = null;
    this.imageCache.clear();

    document.querySelector('#movieScreen')?.classList.remove('active');
    document.querySelector('#catalogScreen')?.classList.add('active');
    document.querySelector('#backBtn')?.style.setProperty('display', 'none', 'important');
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

    Object.entries(infoMap).forEach(([id, value]) => {
      const element = document.querySelector(`#${id}`);
      if (element) element.textContent = value;
    });

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

    const sourceElement = document.querySelector('#descriptionSource');
    if (sourceElement) {
      sourceElement.style.display = 'none';
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
      this.loadPage(this.state.currentPage - 1);
    }
  }

  nextPage() {
    if (this.state.currentPage < this.state.totalPages) {
      this.loadPage(this.state.currentPage + 1);
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
    ['#movieTitle', '#kinopoiskId', '#yearFilter', '#genreFilter'].forEach(selector => {
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

window.addEventListener('beforeunload', () => {
  movieApp?.destroy();
});