class MovieCatalogApp {
  constructor() {
    this.state = {
      currentMovies: [],
      currentPage: 1,
      totalPages: 1,
      totalMovies: 0,
      settings: { 
        blockAds: true, 
        autoStart: false,
        highQualityPosters: false 
      },
      isSearching: false,
      searchParams: {},
      currentMovie: null,
      currentPlayer: 'main',
      posterCache: new Map() 
    };
    this.playerConfig = {
      token: 'API',
      width: '100%',
      height: '100%'
    };
    this.init();
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

  updateProgress(percent) {
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
  }

  bindEvents() {
    document.addEventListener('click', (e) => {
      const movieCard = e.target.closest('.movie-card');
      if (movieCard) {
        const kinopoiskId = movieCard.dataset.kinopoiskId;
        if (kinopoiskId) this.handleMovieClick(kinopoiskId);
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
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelector('.modal.active')?.classList.remove('active');
      }
    });

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
      ['#autoStartToggle', 'change', (e) => this.toggleAutoStart(e.target.checked)],
      ['#highQualityPostersToggle', 'change', (e) => this.toggleHighQualityPosters(e.target.checked)],
      ['#openFramerateLink', 'click', (e) => {
        e.preventDefault();
        window.electronAPI.openExternalUrl('https://framerate.live');
      }]
    ];

    eventMap.forEach(([selector, event, handler]) => {
      document.querySelector(selector)?.addEventListener(event, handler);
    });

    ['#minimizeBtn', '#maximizeBtn', '#closeBtn'].forEach((selector, index) => {
      document.querySelector(selector)?.addEventListener('click', [
        () => window.electronAPI.minimizeWindow(),
        () => window.electronAPI.toggleMaximizeWindow(),
        () => window.electronAPI.closeWindow()
      ][index]);
    });

    window.electronAPI.onWindowMaximized(() => {
      document.querySelector('#maximizeBtn')?.classList.add('maximized');
    });
    window.electronAPI.onWindowUnmaximized(() => {
      document.querySelector('#maximizeBtn')?.classList.remove('maximized');
    });
  }

  async handleMovieClick(kinopoiskId) {
    this.showGlobalLoading(true, 'Загрузка фильма...');
    try {
      const response = await window.electronAPI.getMovieDetails({ kinopoisk_id: kinopoiskId });
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

  async loadSettings() {
    try {
      this.state.settings = await window.electronAPI.getSettings();
      document.querySelector('#blockAdsToggle').checked = this.state.settings.blockAds;
      document.querySelector('#autoStartToggle').checked = this.state.settings.autoStart;
      document.querySelector('#highQualityPostersToggle').checked = this.state.settings.highQualityPosters;
    } catch (error) {
      this.showError('Не удалось загрузить настройки');
    }
  }

  showPostersLoading() {
    document.querySelectorAll('.movie-poster').forEach(poster => {
      poster.classList.add('poster-loading');
    });
  }

  hidePostersLoading() {
    document.querySelectorAll('.movie-poster').forEach(poster => {
      poster.classList.remove('poster-loading');
    });
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
        this.displayMovies(this.state.currentMovies);
      }
    } catch (error) {
      document.querySelector('#highQualityPostersToggle').checked = !enabled;
      this.showError('Ошибка сохранения настроек постеров');
    }
  }

  showModal(selector) {
    document.querySelector(selector)?.classList.add('active');
  }

  onFilterChange() {
    if (this.state.isSearching) {
      this.searchMovies();
    }
  }

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
    } finally {
      this.setLoading(false);
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
      } finally {
        this.setLoading(false);
      }
    } else {
      await this.loadMovies(1);
    }
  }

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

  handleApiResponse(response, page) {
    if (!response.success) {
      this.showError(`Ошибка: ${response.error}`);
      this.displayEmptyState();
      return;
    }

    const filteredMovies = response.data.results.filter(movie => 
      movie.kinopoisk_id && 
      movie.kinopoisk_id !== 'null' && 
      movie.kinopoisk_id !== '' && 
      !isNaN(movie.kinopoisk_id)
    );

    this.state.currentMovies = filteredMovies;
    this.state.totalMovies = response.data.total || 0; 
    this.state.currentPage = page;
    this.state.totalPages = Math.ceil(this.state.totalMovies / 12) || 1;

    this.displayMovies(this.state.currentMovies);
    this.updatePagination();
    this.updateStats();
  }

  async displayMovies(movies) {
    const container = document.querySelector('#moviesContainer');
    if (!container) return;

    if (movies?.length) {
      container.innerHTML = movies.map(movie => this.createMovieCard(movie)).join('');
      
      if (this.state.settings.highQualityPosters) {
        await this.loadHighQualityPosters(movies);
      }
    } else {
      this.displayEmptyState();
    }
  }

  async loadHighQualityPosters(movies) {
    this.showPostersLoading();
    
    const posterPromises = movies.map(async (movie, index) => {
      if (!movie.kinopoisk_id) return;

      const cacheKey = `${movie.kinopoisk_id}_${movie.type || 'movie'}`;
      
      if (this.state.posterCache.has(cacheKey)) {
        const cachedPoster = this.state.posterCache.get(cacheKey);
        this.updateMoviePoster(index, cachedPoster);
        return;
      }

      try {
        const mediaType = this.determineTmdbMediaType(movie.type);
        const response = await window.electronAPI.getTmdbPoster({
          kinopoiskId: movie.kinopoisk_id,
          mediaType: mediaType
        });

        if (response.success && response.data.posterUrl) {
          this.state.posterCache.set(cacheKey, response.data.posterUrl);
          this.updateMoviePoster(index, response.data.posterUrl);
        } else {
          this.state.posterCache.set(cacheKey, null);
        }
      } catch (error) {
        this.state.posterCache.set(cacheKey, null);
      }
    });

    await Promise.allSettled(posterPromises);
    this.hidePostersLoading();
  }

  updateMoviePoster(index, posterUrl) {
    if (!posterUrl) return;

    const movieCard = document.querySelectorAll('.movie-card')[index];
    if (!movieCard) return;

    const posterImg = movieCard.querySelector('.movie-poster img');
    const placeholder = movieCard.querySelector('.poster-placeholder');
    
    if (posterImg) {
      posterImg.src = posterUrl;
      posterImg.style.display = 'block';
    }
    
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }

  determineTmdbMediaType(apiType) {
    const typeMap = {
      'film': 'movie',
      'series': 'tv',
      'cartoon': 'movie',
      'cartoon-serials': 'tv',
      'show': 'tv',
      'anime': 'movie',
      'anime-serials': 'tv',
      'tv-show': 'tv',
      'anime-film': 'movie',
      'cartoon-series': 'tv',
      'anime-series': 'tv'
    };
    return typeMap[apiType] || 'movie';
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

    return `
      <div class="movie-card" data-kinopoisk-id="${movie.kinopoisk_id}" data-id="${movie.id}">
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
        </div>
      </div>
    `;
  }

  async populateMovieScreen() {
    this.fillMovieInfo(this.state.currentMovie);
    this.switchPlayer(this.state.currentPlayer);
    this.showMovieScreen();
    this.hidePartsSection();

    if (this.state.settings.highQualityPosters && this.state.currentMovie?.kinopoisk_id) {
      await this.loadHighQualityMoviePoster();
    }

    if (this.state.currentMovie?.parts && this.state.currentMovie.parts.length > 1) {
      await this.loadPartsSection(this.state.currentMovie.parts);
    }
  }

  async loadHighQualityMoviePoster() {
    const movie = this.state.currentMovie;
    if (!movie?.kinopoisk_id) return;

    const cacheKey = `${movie.kinopoisk_id}_${movie.type || 'movie'}`;
    
    try {
      let posterUrl = null;
      
      if (this.state.posterCache.has(cacheKey)) {
        posterUrl = this.state.posterCache.get(cacheKey);
      } else {
        const mediaType = this.determineTmdbMediaType(movie.type);
        const response = await window.electronAPI.getTmdbPoster({
          kinopoiskId: movie.kinopoisk_id,
          mediaType: mediaType
        });

        if (response.success && response.data.posterUrl) {
          posterUrl = response.data.posterUrl;
          this.state.posterCache.set(cacheKey, posterUrl);
        }
      }

      if (posterUrl) {
        const posterImg = document.querySelector('#posterImage');
        if (posterImg) {
          posterImg.src = posterUrl;
          posterImg.style.display = 'block';
        }
      }
    } catch (error) {
      // Используем оригинальный постер при ошибке
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

      const partsSection = document.querySelector('#partsSection');
      if (partsSection) {
        partsSection.style.display = 'block';
      }
    } catch (error) {
      this.hidePartsSection();
    } finally {
      this.showGlobalLoading(false);
    }
  }

  showMovieScreen() {
    document.querySelector('#catalogScreen')?.classList.remove('active');
    document.querySelector('#movieScreen')?.classList.add('active');
    document.querySelector('#backBtn')?.style.setProperty('display', 'block', 'important');
  }

  showCatalog() {
    document.querySelector('#movieScreen')?.classList.remove('active');
    document.querySelector('#catalogScreen')?.classList.add('active');
    document.querySelector('#backBtn')?.style.setProperty('display', 'none', 'important');
    this.hidePartsSection();
  }

  loadMainPlayer() {
    if (!this.state.currentMovie?.kinopoisk_id) {
      this.showError('Нет данных для загрузки основного плеера');
      return;
    }

    const iframeContainer = document.querySelector('#mainIframeContainer');
    const loading = document.querySelector('#mainPlayerLoading');

    if (iframeContainer && loading) {
      loading.style.display = 'block';
      loading.textContent = 'Загрузка основного плеера...';
      iframeContainer.innerHTML = '<div id="mainIframe"></div>';

      setTimeout(() => {
        try {
          if (typeof addtoiframe === 'function') {
            addtoiframe('mainIframe', this.state.currentMovie.kinopoisk_id, this.playerConfig.width, this.playerConfig.height, this.playerConfig.token);
            loading.style.display = 'none';
          } else {
            loading.textContent = 'Ошибка: Скрипт плеера не загружен';
            loading.style.color = '#e74c3c';
          }
        } catch (error) {
          loading.textContent = `Ошибка: ${error.message}`;
          loading.style.color = '#e74c3c';
        }
      }, 1000);
    }
  }

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
          };

          player.onerror = () => {
            loading.textContent = 'Ошибка загрузки плеера';
            loading.style.color = '#e74c3c';
          };
        } catch (error) {
          loading.textContent = `Ошибка: ${error.message}`;
          loading.style.color = '#e74c3c';
        }
      }, 500);
    }
  }

  switchPlayer(player) {
    this.state.currentPlayer = player;

    document.querySelectorAll('.player-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-player="${player}"]`)?.classList.add('active');

    document.querySelectorAll('.player-container').forEach(cont => cont.classList.remove('active'));
    document.querySelector(`#${player === 'main' ? 'mainPlayer' : 'alternativePlayer'}`)?.classList.add('active');

    if (player === 'main') {
      this.loadMainPlayer();
    } else {
      this.loadAlternativePlayer();
    }
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
  }

  formatRating(rating) {
    if (!rating || rating === 'null') return null;
    const num = parseFloat(rating);
    return isNaN(num) ? null : num.toFixed(1);
  }

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

  normalizeType(type) {
    if (!type) return type;
 
    const typeMap = {
      'tv-show': 'show',
      'anime-film': 'anime',
      'cartoon-series': 'cartoon-serials',
      'anime-series': 'anime-serials'
    };
 
    return typeMap[type] || type; 
  }

  getTypeLabel(type) {
    const normalizedType = this.normalizeType(type); 
    const labels = {
      film: 'Фильм',
      series: 'Сериал',
      cartoon: 'Мультфильм',
      'cartoon-serials': 'Мультсериал',
      show: 'Шоу',
      anime: 'Аниме',
      'anime-serials': 'Аниме-сериал'
    };
    return labels[normalizedType] || normalizedType || '—';
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
    const params = this.state.isSearching ? { ...this.state.searchParams, page, limit: 12 } : { page, limit: 12 };
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

  setLoading(loading) {
    const btn = document.querySelector('#searchBtn');
    if (!btn) return;

    const textSpan = btn.querySelector('.btn-text');
    const loadingSpan = btn.querySelector('.btn-loading');
    btn.disabled = loading;
    if (textSpan) textSpan.style.display = loading ? 'none' : 'inline';
    if (loadingSpan) loadingSpan.style.display = loading ? 'inline' : 'none';
  }

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

  hidePartsSection() {
    const partsSection = document.querySelector('#partsSection');
    if (partsSection) {
      partsSection.style.display = 'none';
    }
  }
}

const movieApp = new MovieCatalogApp();