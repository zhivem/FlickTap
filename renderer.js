/**
 * Movie Catalog App - Renderer Process Controller.
 * Manages UI state, API calls via Electron API, and user interactions.
 */
class MovieCatalogApp {
  constructor() {
    this.state = {
      currentMovies: [],
      currentPage: 1,
      totalPages: 1,
      totalMovies: 0,
      settings: { blockAds: true },
      isSearching: false,
      searchParams: {},
      currentMovie: null,
      currentPlayer: 'main'
    };
    this.cache = new Map();
    this.playerConfig = {
      token: 'KEY',
      width: '100%',
      height: '100%'
    };
    this.init();
  }

  /**
   * Initializes the app: binds events, loads settings, and fetches initial data.
   */
  async init() {
    this.createLoadingOverlay();
    this.bindEvents();
    await this.loadSettings();
    await this.loadMovies();
  }

  /**
   * Creates global loading overlay and progress bar.
   */
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

  /**
   * Shows/hides global loading overlay with optional text.
   * @param {boolean} show - Whether to show the overlay.
   * @param {string} text - Loading text.
   */
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

  /**
   * Updates progress bar percentage.
   * @param {number} percent - Progress from 0 to 100.
   */
  updateProgress(percent) {
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
  }

  /**
   * Binds all event listeners for UI elements.
   */
  bindEvents() {
    const eventMap = [
      ['#searchBtn', 'click', () => this.searchMovies()],
      ['#clearBtn', 'click', () => this.clearSearch()],
      ['#backBtn', 'click', () => this.showCatalog()],
      ['#movieTitle', 'keypress', (e) => e.key === 'Enter' && this.searchMovies()],
      ['#kinopoiskId', 'input', (e) => this.validateIdInput(e)],
      ['#prevPage', 'click', () => this.prevPage()],
      ['#nextPage', 'click', () => this.nextPage()],
      ['#typeFilter, #qualityFilter, #yearFilter', 'change', () => this.onFilterChange()],
      ['#player1Btn', 'click', () => this.switchPlayer('main')],
      ['#player2Btn', 'click', () => this.switchPlayer('alternative')],
      ['#settingsBtn', 'click', () => this.showModal('#settingsModal')],
      ['#blockAdsToggle', 'change', (e) => this.toggleBlockAds(e.target.checked)],
      ['#openFramerateLink', 'click', (e) => {
        e.preventDefault();
        window.electronAPI.openExternalUrl('https://framerate.live');
      }]
    ];

    eventMap.forEach(([selector, event, handler]) => {
      document.querySelector(selector)?.addEventListener(event, handler);
    });

    // Global events
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelector('.modal.active')?.classList.remove('active');
      }
    });

    // Window controls
    ['#minimizeBtn', '#maximizeBtn', '#closeBtn'].forEach((selector, index) => {
      document.querySelector(selector)?.addEventListener('click', [
        () => window.electronAPI.minimizeWindow(),
        () => window.electronAPI.toggleMaximizeWindow(),
        () => window.electronAPI.closeWindow()
      ][index]);
    });

    // Window state listeners
    window.electronAPI.onWindowMaximized(() => {
      document.querySelector('#maximizeBtn')?.classList.add('maximized');
    });
    window.electronAPI.onWindowUnmaximized(() => {
      document.querySelector('#maximizeBtn')?.classList.remove('maximized');
    });
  }

  /**
   * Loads app settings from Electron store.
   */
  async loadSettings() {
    try {
      this.state.settings = await window.electronAPI.getSettings();
      document.querySelector('#blockAdsToggle').checked = this.state.settings.blockAds;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Toggles ad blocking and updates settings.
   * @param {boolean} enabled - Whether to enable ad blocking.
   */
  async toggleBlockAds(enabled) {
    try {
      await window.electronAPI.setBlockAds(enabled);
      this.state.settings.blockAds = enabled;
      this.showToast(enabled ? 'Реклама заблокирована' : 'Реклама включена');
    } catch (error) {
      document.querySelector('#blockAdsToggle').checked = !enabled;
      this.showError('Ошибка сохранения настроек');
      console.error('Ad blocking toggle failed:', error);
    }
  }

  /**
   * Shows modal by selector.
   * @param {string} selector - Modal selector.
   */
  showModal(selector) {
    document.querySelector(selector)?.classList.add('active');
  }

  /**
   * Handles filter changes during search.
   */
  onFilterChange() {
    if (this.state.isSearching) {
      this.searchMovies();
    }
  }

  /**
   * Loads movies for a specific page.
   * @param {number} page - Page number.
   */
  async loadMovies(page = 1) {
    this.setLoading(true);
    this.showSkeletonLoading();
    this.state.isSearching = false;

    try {
      const response = await window.electronAPI.getMovieList({ page, limit: 12 });
      this.handleApiResponse(response, page);
    } catch (error) {
      this.showError(`Ошибка: ${error.message}`);
      this.displayEmptyState();
      console.error('Failed to load movies:', error);
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Shows skeleton loading placeholders in movies container.
   */
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

  /**
   * Performs search with current params.
   */
  async searchMovies() {
    const params = this.getSearchParams();
    this.state.searchParams = params;
    this.state.isSearching = Object.keys(params).length > 0;

    if (this.state.isSearching) {
      this.setLoading(true);
      this.showSkeletonLoading();

      try {
        const response = await window.electronAPI.getMovieList({ ...params, page: 1, limit: 12 });
        this.handleApiResponse(response, 1);
      } catch (error) {
        this.showError(`Ошибка: ${error.message}`);
        this.displayEmptyState();
        console.error('Search failed:', error);
      } finally {
        this.setLoading(false);
      }
    } else {
      await this.loadMovies(1);
    }
  }

  /**
   * Extracts search parameters from form inputs.
   * @returns {Object} Search params.
   */
  getSearchParams() {
    const paramMap = {
      name: '#movieTitle',
      kinopoisk_id: '#kinopoiskId',
      type: '#typeFilter',
      quality: '#qualityFilter',
      year: '#yearFilter'
    };

    const params = {};
    Object.entries(paramMap).forEach(([key, selector]) => {
      const element = document.querySelector(selector);
      const value = element?.value?.trim();
      if (value) {
        params[key] = value;
      }
    });
    return params;
  }

  /**
   * Handles API response for movie list.
   * @param {Object} response - API response.
   * @param {number} page - Current page.
   */
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

  /**
   * Displays movies in the container.
   * @param {Array} movies - Array of movies.
   */
  displayMovies(movies) {
    const container = document.querySelector('#moviesContainer');
    if (!container) return;

    if (movies?.length) {
      container.innerHTML = movies.map(movie => this.createMovieCard(movie)).join('');
      this.bindMovieCardEvents();
    } else {
      this.displayEmptyState();
    }
  }

  /**
   * Creates HTML for a single movie card.
   * @param {Object} movie - Movie data.
   * @returns {string} HTML string.
   */
  createMovieCard(movie) {
    const hasPoster = movie.poster && movie.poster !== 'null';
    const kpRating = this.formatRating(movie.kinopoisk);
    const imdbRating = this.formatRating(movie.imdb);
    const metaTags = [
      movie.year && `<span class="movie-year-tag">${movie.year}</span>`,
      kpRating && `<span class="rating-kp-tag">КП: ${kpRating}</span>`,
      imdbRating && `<span class="rating-imdb-tag">IMDb: ${imdbRating}</span>`,
      this.getTypeLabel(movie.type) && `<span class="movie-type-tag">${this.getTypeLabel(movie.type)}</span>`,
      this.getQualityLabel(movie.quality) && `<span class="movie-quality-tag">${this.getQualityLabel(movie.quality)}</span>`
    ].filter(Boolean).join('');

    return `
      <div class="movie-card" data-movie-id="${movie.id}" data-kinopoisk-id="${movie.kinopoisk_id}">
        <div class="movie-poster">
          ${hasPoster ? 
            `<img src="${movie.poster}" alt="${movie.name}" loading="lazy" 
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
             <div class="poster-placeholder" style="display:none;">Movie</div>` : 
            '<div class="poster-placeholder">Movie</div>'
          }
        </div>
        <div class="movie-info">
          <div class="movie-title">${movie.name || '—'}</div>
          <div class="movie-meta-row">${metaTags}</div>
          ${movie.name_eng ? `<div class="movie-title-en">${movie.name_eng}</div>` : ''} <!-- Условный рендер, чтобы не было пустого div; fallback на "" в CSS -->
        </div>
      </div>
    `;
  }

  /**
   * Binds click events to movie cards.
   */
  bindMovieCardEvents() {
    document.querySelectorAll('.movie-card').forEach(card => {
      card.addEventListener('click', () => {
        this.openMovie(card.dataset.movieId, card.dataset.kinopoiskId);
      });
    });
  }

  /**
   * Displays empty state or placeholder.
   */
  displayEmptyState() {
    const container = document.querySelector('#moviesContainer');
    if (!container) return;

    const message = this.state.isSearching ? 'По вашему запросу ничего не найдено' : 'Загрузка фильмов...';
    const icon = this.state.isSearching ? 'Поиск' : 'Ожидание';

    container.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon">${icon}</div>
        <div class="placeholder-text">${message}</div>
      </div>
    `;
  }

  /**
   * Opens movie details screen.
   * @param {string} movieId - Movie ID.
   * @param {string} kinopoiskId - Kinopoisk ID.
   */
  async openMovie(movieId, kinopoiskId) {
    if (!movieId) {
      this.showError('ID фильма отсутствует');
      return;
    }

    this.showGlobalLoading(true, 'Загрузка информации о фильме...');
    this.updateProgress(20);

    this.showScreen('movieScreen');
    this.updateTitle('Загрузка...', 'Получение данных о фильме');

    try {
      this.updateProgress(50);
      // Note: Assuming getMovieDetails fetches full data; integrate kinopoisk ratings if needed
      const response = await window.electronAPI.getMovieDetails({ id: movieId });
      if (response.success) {
        this.state.currentMovie = response.data;
        this.fillMovieInfo(response.data);
        this.updateProgress(80);
        this.loadVideo(response.data);
        this.updateProgress(100);
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      this.showError(`Ошибка загрузки фильма: ${error.message}`);
      console.error('Movie load failed:', error);
      this.showCatalog();
    } finally {
      this.showGlobalLoading(false);
      this.updateProgress(0);
    }
  }

  /**
   * Shows a specific screen.
   * @param {string} screenId - Screen ID (catalogScreen or movieScreen).
   */
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.toggle('active', screen.id === screenId);
    });

    // Show/hide back button
    document.querySelector('#backBtn').style.display = screenId === 'movieScreen' ? 'block' : 'none';
  }

  /**
   * Shows catalog screen and resets state.
   */
  showCatalog() {
    this.showScreen('catalogScreen');
    this.updateTitle('Каталог фильмов', 'База фильмов и сериалов');
    this.resetPlayers();
    this.hidePartsSection();
  }

  /**
   * Updates page title and subtitle.
   * @param {string} title - Main title.
   * @param {string} subtitle - Subtitle.
   */
  updateTitle(title, subtitle) {
    const mainTitle = document.querySelector('#mainTitle');
    const mainSubtitle = document.querySelector('#mainSubtitle');
    if (mainTitle) mainTitle.textContent = title;
    if (mainSubtitle) mainSubtitle.textContent = subtitle;
  }

  /**
   * Resets player states.
   */
  resetPlayers() {
    const mainContainer = document.querySelector('#mainIframeContainer');
    if (mainContainer) {
      mainContainer.innerHTML = '<div id="mainIframe"></div>';
    }

    const mainLoading = document.querySelector('#mainPlayerLoading');
    if (mainLoading) {
      mainLoading.style.display = 'block';
      mainLoading.textContent = 'Загрузка основного плеера...';
      mainLoading.style.color = '';
    }

    // Reset alternative player
    const altPlayer = document.querySelector('#alternativeVideoPlayer');
    if (altPlayer) {
      altPlayer.src = '';
    }

    const altLoading = document.querySelector('#altPlayerLoading');
    if (altLoading) {
      altLoading.style.display = 'block';
      altLoading.textContent = 'Загрузка альтернативного плеера...';
      altLoading.style.color = '';
    }

    this.switchPlayer('main');
  }

  /**
   * Switches between players.
   * @param {string} player - 'main' or 'alternative'.
   */
  switchPlayer(player) {
    const playerMap = {
      main: ['#player1Btn', '#mainPlayer'],
      alternative: ['#player2Btn', '#alternativePlayer']
    };

    Object.entries(playerMap).forEach(([key, [btnSel, contSel]]) => {
      const btn = document.querySelector(btnSel);
      const container = document.querySelector(contSel);
      if (btn && container) {
        const isActive = key === player;
        btn.classList.toggle('active', isActive);
        container.classList.toggle('active', isActive);
      }
    });

    this.state.currentPlayer = player;
    if (player === 'alternative') {
      this.loadAlternativePlayer();
    }
  }

  /**
   * Loads video in main player.
   * @param {Object} movie - Movie data.
   */
  loadVideo(movie) {
    if (this.state.currentPlayer !== 'main') return;

    const container = document.querySelector('#mainIframeContainer');
    const loading = document.querySelector('#mainPlayerLoading');

    if (!container || !movie.kinopoisk_id) {
      this.showError('Данные для загрузки плеера отсутствуют');
      return;
    }

    loading.style.display = 'block';
    loading.textContent = 'Загрузка основного плеера...';

    container.innerHTML = '<div id="mainIframe"></div>';

    setTimeout(() => {
      try {
        if (typeof addtoiframe === 'function') {
          addtoiframe('mainIframe', movie.kinopoisk_id, this.playerConfig.width, this.playerConfig.height, this.playerConfig.token);
          loading.style.display = 'none';
          this.showToast('Основной плеер загружен');
        } else {
          loading.textContent = 'Ошибка: Плеер не загрузился';
          loading.style.color = '#e74c3c';
        }
      } catch (error) {
        loading.textContent = `Ошибка: ${error.message}`;
        loading.style.color = '#e74c3c';
        console.error('Main player load failed:', error);
      }
    }, 1000);
  }

  /**
   * Loads alternative player.
   */
  loadAlternativePlayer() {
    if (!this.state.currentMovie?.kinopoisk_id) {
      this.showError('Нет данных для загрузки альтернативного плеера');
      return;
    }

    const player = document.querySelector('#alternativeVideoPlayer');
    const loading = document.querySelector('#altPlayerLoading');

    if (player && loading) {
      loading.style.display = 'block';
      loading.textContent = 'Загрузка альтернативного плеера...';
      player.src = '';

      setTimeout(() => {
        try {
          const kinopoiskId = this.state.currentMovie.kinopoisk_id;
          let iframeUrl = `//p.lumex.cloud/Agk530pFHbAV?kp_id=${kinopoiskId}`;
          if (iframeUrl.startsWith('//')) {
            iframeUrl = 'https:' + iframeUrl;
          }
          player.src = iframeUrl;

          player.onload = () => {
            loading.style.display = 'none';
            this.showToast('Альтернативный плеер загружен');
          };

          player.onerror = () => {
            loading.textContent = 'Ошибка загрузки плеера';
            loading.style.color = '#e74c3c';
          };
        } catch (error) {
          loading.textContent = `Ошибка: ${error.message}`;
          loading.style.color = '#e74c3c';
          console.error('Alternative player load failed:', error);
        }
      }, 500);
    }
  }

  /**
   * Fills movie info into UI elements.
   * @param {Object} movie - Movie data.
   */
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

    // Poster
    const posterImg = document.querySelector('#posterImage');
    if (posterImg) {
      const hasPoster = movie.poster && movie.poster !== 'null';
      posterImg.src = hasPoster ? movie.poster : '';
      posterImg.style.display = hasPoster ? 'block' : 'none';
    }

    // Categories
    const categoryTags = document.querySelector('#categoryTags');
    if (categoryTags) {
      categoryTags.innerHTML = movie.rate_mpaa ? `<span class="category-tag">${movie.rate_mpaa}</span>` : '';
    }
  }

  /**
   * Formats rating to 1 decimal place.
   * @param {string|number} rating - Raw rating.
   * @returns {string|null} Formatted rating.
   */
  formatRating(rating) {
    if (!rating || rating === 'null') return null;
    const num = parseFloat(rating);
    return isNaN(num) ? null : num.toFixed(1);
  }

  /**
   * Gets quality label.
   * @param {number} quality - Quality code.
   * @returns {string} Label.
   */
  getQualityLabel(quality) {
    const labels = {
      0: '—',
      1: 'HD',
      2: 'TS',
      3: 'SD',
      4: 'FHD'
    };
    return labels[quality] || quality || '—';
  }

  /**
   * Gets type label.
   * @param {string} type 
   * @returns {string} 
   */
  getTypeLabel(type) {
    const labels = {
      film: 'Фильм',
      series: 'Сериал',
      cartoon: 'Мультфильм',
      'cartoon-serials': 'Мультсериал',
      show: 'Шоу',
      anime: 'Аниме',
      'anime-serials': 'Аниме-сериал'
    };
    return labels[type] || type || '—';
  }

  /**
   * Formats money value.
   * @param {string} value - Raw money string.
   * @returns {string} Formatted currency.
   */
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

  /**
   * Formats object values to comma-separated string.
   * @param {Object} obj - Object with values.
   * @returns {string} Formatted string.
   */
  formatObject(obj) {
    if (!obj || typeof obj !== 'object') return '—';
    const values = Object.values(obj).filter(val => val && val !== 'null');
    return values.length ? values.join(', ') : '—';
  }

  /**
   * Goes to previous page.
   */
  prevPage() {
    if (this.state.currentPage > 1) {
      this.loadPage(this.state.currentPage - 1);
    }
  }

  /**
   * Goes to next page.
   */
  nextPage() {
    if (this.state.currentPage < this.state.totalPages) {
      this.loadPage(this.state.currentPage + 1);
    }
  }

  /**
   * Loads a specific page.
   * @param {number} page - Page number.
   */
  async loadPage(page) {
    const params = this.state.isSearching ? { ...this.state.searchParams, page, limit: 12 } : { page, limit: 12 };
    const response = await window.electronAPI.getMovieList(params);
    this.handleApiResponse(response, page);
  }

  /**
   * Updates pagination UI.
   */
  updatePagination() {
    const prevBtn = document.querySelector('#prevPage');
    const nextBtn = document.querySelector('#nextPage');
    const pageNum = document.querySelector('#pageNumber');

    if (prevBtn) prevBtn.disabled = this.state.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = this.state.currentPage >= this.state.totalPages;
    if (pageNum) pageNum.textContent = this.state.currentPage;
  }

  /**
   * Updates stats UI.
   */
  updateStats() {
    const totalMoviesEl = document.querySelector('#totalMovies');
    const currentPageEl = document.querySelector('#currentPage');

    if (totalMoviesEl) totalMoviesEl.textContent = this.state.totalMovies.toLocaleString();
    if (currentPageEl) currentPageEl.textContent = this.state.currentPage;
  }

  /**
   * Validates Kinopoisk ID input (numbers only).
   * @param {Event} event - Input event.
   */
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

  /**
   * Sets loading state on search button.
   * @param {boolean} loading - Loading state.
   */
  setLoading(loading) {
    const btn = document.querySelector('#searchBtn');
    if (!btn) return;

    const textSpan = btn.querySelector('.btn-text');
    const loadingSpan = btn.querySelector('.btn-loading');
    btn.disabled = loading;
    if (textSpan) textSpan.style.display = loading ? 'none' : 'inline';
    if (loadingSpan) loadingSpan.style.display = loading ? 'inline' : 'none';
  }

  /**
   * Clears search form and reloads.
   */
  clearSearch() {
    ['#movieTitle', '#kinopoiskId', '#yearFilter'].forEach(selector => {
      document.querySelector(selector).value = '';
    });
    ['#typeFilter', '#qualityFilter'].forEach(selector => {
      document.querySelector(selector).value = '';
    });
    document.querySelector('#idValidation').textContent = '';
    this.state.searchParams = {};
    this.state.isSearching = false;
    this.loadMovies(1);
  }

  /**
   * Shows toast notification.
   * @param {string} message - Message text.
   */
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /**
   * Shows error toast.
   * @param {string} message - Error message.
   */
  showError(message) {
    this.showToast(`Ошибка: ${message}`);
  }

  /**
   * Hides parts section (franchise parts).
   */
  hidePartsSection() {
    const partsSection = document.querySelector('#partsSection');
    if (partsSection) {
      partsSection.style.display = 'none';
    }
  }
}

// Initialize app
const movieApp = new MovieCatalogApp();