class MovieCatalogApp {
    constructor() {
        this.state = {
            currentMovies: [],
            currentPage: 1,
            totalPages: 1,
            totalMovies: 0,
            settings: {
                blockAds: !0
            },
            isSearching: !1,
            searchParams: {},
            currentMovie: null,
            currentPlayer: "main"
        }, this.cache = new Map, this.init()
    }
    async init() {
        this.bindEvents(), await this.loadSettings(), await this.loadMovies()
    }
    bindEvents() {
        [
            ["#searchBtn", "click", () => this.searchMovies()],
            ["#clearBtn", "click", () => this.clearSearch()],
            ["#backBtn", "click", () => this.showCatalog()],
            ["#movieTitle", "keypress", e => "Enter" === e.key && this.searchMovies()],
            ["#kinopoiskId", "input", e => this.validateIdInput(e)],
            ["#prevPage", "click", () => this.prevPage()],
            ["#nextPage", "click", () => this.nextPage()],
            ["#typeFilter, #qualityFilter, #yearFilter", "change", () => this.onFilterChange()],
            ["#player1Btn", "click", () => this.switchPlayer("main")],
            ["#player2Btn", "click", () => this.switchPlayer("alternative")],
            ["#settingsBtn", "click", () => this.showModal("#settingsModal")],
            ["#blockAdsToggle", "change", e => this.toggleBlockAds(e.target.checked)],
            ["#openFramerateLink", "click", e => {
                e.preventDefault(), window.electronAPI.openExternalUrl("https://framerate.live")
            }]
        ].forEach(([e, t, i]) => {
            document.querySelector(e)?.addEventListener(t, i)
        }), document.addEventListener("click", e => {
            e.target.classList.contains("modal") && e.target.classList.remove("active")
        }), document.addEventListener("keydown", e => {
            "Escape" === e.key && document.querySelector(".modal.active")?.classList.remove("active")
        }), ["#minimizeBtn", "#maximizeBtn", "#closeBtn"].forEach((e, t) => {
            document.querySelector(e)?.addEventListener("click", [() => window.electronAPI.minimizeWindow(), () => window.electronAPI.toggleMaximizeWindow(), () => window.electronAPI.closeWindow()][t])
        }), window.electronAPI.onWindowMaximized(() => {
            document.querySelector("#maximizeBtn")?.classList.add("maximized")
        }), window.electronAPI.onWindowUnmaximized(() => {
            document.querySelector("#maximizeBtn")?.classList.remove("maximized")
        })
    }
    async loadSettings() {
        try {
            this.state.settings = await window.electronAPI.getSettings(), document.querySelector("#blockAdsToggle").checked = this.state.settings.blockAds
        } catch (e) {}
    }
    async toggleBlockAds(e) {
        try {
            await window.electronAPI.setBlockAds(e), this.state.settings.blockAds = e, this.showToast(e ? "Реклама заблокирована" : "Реклама включена")
        } catch (t) {
            document.querySelector("#blockAdsToggle").checked = !e, this.showError("Ошибка сохранения настроек")
        }
    }
    showModal(e) {
        document.querySelector(e)?.classList.add("active")
    }
    onFilterChange() {
        this.state.isSearching && this.searchMovies()
    }
    async loadMovies(e = 1) {
        this.setLoading(!0), this.state.isSearching = !1;
        try {
            const t = await window.electronAPI.getMovieList({
                page: e,
                limit: 12
            });
            this.handleApiResponse(t, e)
        } catch (e) {
            this.showError(`Ошибка: ${e.message}`), this.displayEmptyState()
        } finally {
            this.setLoading(!1)
        }
    }
    async searchMovies() {
        const e = this.getSearchParams();
        if (this.state.searchParams = e, this.state.isSearching = Object.keys(e).length > 0, this.state.isSearching) {
            this.setLoading(!0);
            try {
                const t = await window.electronAPI.getMovieList({
                    ...e,
                    page: 1,
                    limit: 12
                });
                this.handleApiResponse(t, 1)
            } catch (e) {
                this.showError(`Ошибка: ${e.message}`), this.displayEmptyState()
            } finally {
                this.setLoading(!1)
            }
        } else await this.loadMovies(1)
    }
    getSearchParams() {
        const e = {};
        return Object.entries({
            name: "#movieTitle",
            kinopoisk_id: "#kinopoiskId",
            type: "#typeFilter",
            quality: "#qualityFilter",
            year: "#yearFilter"
        }).forEach(([t, i]) => {
            const a = document.querySelector(i),
                s = a?.value?.trim();
            s && (e[t] = s)
        }), e
    }
    handleApiResponse(e, t) {
        if (!e.success) return this.showError(`Ошибка: ${e.error}`), void this.displayEmptyState();
        this.state.currentMovies = e.data.results || [], this.state.totalMovies = e.data.total || 0, this.state.currentPage = t, this.state.totalPages = Math.ceil(this.state.totalMovies / 12) || 1, this.displayMovies(this.state.currentMovies), this.updatePagination(), this.updateStats()
    }
    displayMovies(e) {
        const t = document.querySelector("#moviesContainer");
        t && (e?.length ? (t.innerHTML = e.map(e => this.createMovieCard(e)).join(""), this.bindMovieCardEvents()) : this.displayEmptyState())
    }
    createMovieCard(e) {
        const t = e.poster && "null" !== e.poster,
            i = this.formatRating(e.kinopoisk),
            a = this.formatRating(e.imdb),
            s = [e.year && `<span class="movie-year-tag">${e.year}</span>`, i && `<span class="rating-kp-tag">КП: ${i}</span>`, a && `<span class="rating-imdb-tag">IMDb: ${a}</span>`, this.getTypeLabel(e.type) && `<span class="movie-type-tag">${this.getTypeLabel(e.type)}</span>`, this.getQualityLabel(e.quality) && `<span class="movie-quality-tag">${this.getQualityLabel(e.quality)}</span>`].filter(Boolean).join("");
        return `\n            <div class="movie-card" data-movie-id="${e.id}" data-kinopoisk-id="${e.kinopoisk_id}">\n                <div class="movie-poster">\n                    ${t?`<img src="${e.poster}" alt="${e.name}" loading="lazy"\n                              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">\n                         <div class="poster-placeholder" style="display:none;">Movie</div>`:'<div class="poster-placeholder">Movie</div>'}\n                </div>\n                <div class="movie-info">\n                    <div class="movie-title">${e.name||"—"}</div>\n                    <div class="movie-meta-row">${s}</div>\n                    <div class="movie-title-en">${e.name_eng||""}</div>\n                </div>\n            </div>\n        `
    }
    bindMovieCardEvents() {
        document.querySelectorAll(".movie-card").forEach(e => {
            e.addEventListener("click", () => this.openMovie(e.dataset.movieId, e.dataset.kinopoiskId))
        })
    }
    displayEmptyState() {
        const e = document.querySelector("#moviesContainer");
        if (!e) return;
        const t = this.state.isSearching ? "По вашему запросу ничего не найдено" : "Загрузка фильмов...",
            i = this.state.isSearching ? "Поиск" : "Ожидание";
        e.innerHTML = `\n            <div class="placeholder">\n                <div class="placeholder-icon">${i}</div>\n                <div class="placeholder-text">${t}</div>\n            </div>\n        `
    }
    async openMovie(e, t) {
        if (e) {
            this.showScreen("movieScreen"), this.updateTitle("Загрузка...", "Получение данных о фильме"), this.setLoading(!0);
            try {
                const [i, a] = await Promise.all([window.electronAPI.getMovieDetails({
                    id: e
                }), t ? window.electronAPI.getKinopoiskRatings(t) : Promise.resolve({
                    success: !1
                })]);
                if (!i.success) throw new Error(i.error);
                this.state.currentMovie = {
                    ...i.data,
                    kinopoisk: a.success ? a.data.kinopoisk : null,
                    imdb: a.success ? a.data.imdb : null
                }, this.fillMovieInfo(this.state.currentMovie), this.loadVideo(this.state.currentMovie), await this.loadMovieParts(this.state.currentMovie), this.updateTitle(this.state.currentMovie.name, this.state.currentMovie.name_eng)
            } catch (e) {
                this.showError(`Ошибка загрузки: ${e.message}`), this.showCatalog()
            } finally {
                this.setLoading(!1)
            }
        }
    }
    async loadMovieParts(e) {
        if (!e.parts || !Array.isArray(e.parts) || e.parts.length <= 1) return void this.hidePartsSection();
        const t = e.parts.filter(t => t !== e.id),
            i = await this.fetchPartsDetails(t);
        this.displayParts(i)
    }
    async fetchPartsDetails(e) {
        return (await Promise.allSettled(e.map(e => window.electronAPI.getMovieDetails({
            id: e
        })))).filter(e => "fulfilled" === e.status && e.value.success).map(e => e.value.data)
    }
    displayParts(e) {
        const t = document.querySelector("#partsList"),
            i = document.querySelector("#partsSection");
        t && i && e.length ? (t.innerHTML = e.map(e => `\n            <div class="part-item" data-movie-id="${e.id}">\n                <span class="part-name">${e.name||"Без названия"}</span>\n                <span class="part-year">${e.year||""}</span>\n            </div>\n        `).join(""), i.style.display = "block", this.bindPartEvents()) : this.hidePartsSection()
    }
    bindPartEvents() {
        document.querySelectorAll(".part-item").forEach(e => {
            e.addEventListener("click", t => {
                t.stopPropagation(), this.openMovie(e.dataset.movieId, "")
            })
        })
    }
    hidePartsSection() {
        document.querySelector("#partsSection").style.display = "none"
    }
    showScreen(e) {
        document.querySelectorAll(".screen").forEach(e => e.classList.remove("active")), document.querySelector(`#${e}`).classList.add("active"), document.querySelector("#backBtn").style.display = "movieScreen" === e ? "block" : "none"
    }
    showCatalog() {
        this.showScreen("catalogScreen"), this.updateTitle("Каталог фильмов", "База фильмов и сериалов"), this.resetPlayers(), this.hidePartsSection()
    }
    updateTitle(e, t) {
        const i = document.querySelector("#mainTitle"),
            a = document.querySelector("#mainSubtitle");
        i && (i.textContent = e), a && (a.textContent = t)
    }
    resetPlayers() {
        ["#videoPlayer", "#alternativeVideoPlayer"].forEach(e => {
            const t = document.querySelector(e);
            t && (t.src = "")
        });
        const e = document.querySelector("#altPlayerLoading");
        e && (e.style.display = "block", e.textContent = "Загрузка альтернативного плеера...", e.style.color = ""), this.switchPlayer("main")
    }
    switchPlayer(e) {
        Object.entries({
            main: ["#player1Btn", "#mainPlayer"],
            alternative: ["#player2Btn", "#alternativePlayer"]
        }).forEach(([t, [i, a]]) => {
            const s = document.querySelector(i),
                o = document.querySelector(a);
            if (s && o) {
                const i = t === e;
                s.classList.toggle("active", i), o.classList.toggle("active", i)
            }
        }), this.state.currentPlayer = e, "alternative" === e && this.loadAlternativePlayer()
    }
    async loadAlternativePlayer() {
        if (!this.state.currentMovie?.kinopoisk_id) return void this.showError("Нет данных для загрузки альтернативного плеера");
        const e = document.querySelector("#alternativeVideoPlayer"),
            t = document.querySelector("#altPlayerLoading");
        if (e && t) {
            t.style.display = "block", t.textContent = "Загрузка альтернативного плеера...", e.src = "";
            try {
                const i = await window.electronAPI.getAlternativePlayer(this.state.currentMovie.kinopoisk_id);
                if (!i.success || !i.data?.iframe_url) throw new Error(i.error || "Плеер недоступен");
                {
                    let a = i.data.iframe_url;
                    a.startsWith("//") && (a = "https:" + a), e.src = a, t.style.display = "none", this.showToast("Альтернативный плеер загружен")
                }
            } catch (e) {
                t.textContent = `Ошибка: ${e.message}`, t.style.color = "#e74c3c"
            }
        }
    }
    loadVideo(e) {
        if ("main" !== this.state.currentPlayer) return;
        const t = document.querySelector("#videoPlayer");
        if (!t || !e.iframe_url || "null" === e.iframe_url) return void this.showError("Видео недоступно");
        let i = e.iframe_url;
        i.startsWith("//") && (i = "https:" + i), t.src = i
    }
    fillMovieInfo(e) {
        const t = {
            moviePlayerTitle: e.name || e.name_eng || "Неизвестно",
            originalTitle: e.name_eng || e.name || "—",
            moviePlayerYear: e.year || "—",
            moviePlayerQuality: this.getQualityLabel(e.quality),
            moviePlayerAge: e.age || "—",
            moviePlayerType: this.getTypeLabel(e.type),
            moviePlayerKp: `КП: ${this.formatRating(e.kinopoisk)||"—"}`,
            moviePlayerImdb: `IMDb: ${this.formatRating(e.imdb)||"—"}`,
            moviePlayerDescription: e.description || "Описание отсутствует",
            movieGenre: this.formatObject(e.genre),
            movieCountry: this.formatObject(e.country),
            movieDirector: this.formatObject(e.director),
            movieActors: this.formatObject(e.actors),
            movieDuration: e.time || "—",
            movieBudget: this.formatMoney(e.budget),
            movieFeesWorld: this.formatMoney(e.fees_world),
            movieFeesUsa: this.formatMoney(e.fees_use),
            movieFeesRus: this.formatMoney(e.fees_rus),
            moviePremier: e.premier || "—",
            moviePremierRus: e.premier_rus || "—"
        };
        Object.entries(t).forEach(([e, t]) => {
            const i = document.querySelector(`#${e}`);
            i && (i.textContent = t)
        });
        const i = document.querySelector("#posterImage");
        if (i) {
            const t = e.poster && "null" !== e.poster;
            i.src = t ? e.poster : "", i.style.display = t ? "block" : "none"
        }
        const a = document.querySelector("#categoryTags");
        a && (a.innerHTML = e.rate_mpaa ? `<span class="category-tag">${e.rate_mpaa}</span>` : "")
    }
    formatRating(e) {
        if (!e || "null" === e) return null;
        const t = parseFloat(e);
        return isNaN(t) ? null : t.toFixed(1)
    }
    getQualityLabel(e) {
        return {
            0: "—",
            1: "HD",
            2: "TS",
            3: "SD",
            4: "FHD"
        } [e] || e || "—"
    }
    getTypeLabel(e) {
        return {
            film: "Фильм",
            series: "Сериал",
            cartoon: "Мультфильм",
            "cartoon-serials": "Мультсериал",
            show: "Шоу",
            anime: "Аниме",
            "anime-serials": "Аниме-сериал"
        } [e] || e || "—"
    }
    formatMoney(e) {
        if (!e || "null" === e || "string" != typeof e) return "—";
        const t = e.match(/[\d\s.,]+(?=\s*[$€₽]?)/g);
        if (!t) return "—";
        const i = t[t.length - 1].replace(/\s/g, "").replace(",", "."),
            a = parseFloat(i);
        return isNaN(a) ? "—" : new Intl.NumberFormat("ru-RU", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0
        }).format(a)
    }
    formatObject(e) {
        if (!e || "object" != typeof e) return "—";
        const t = Object.values(e).filter(e => e && "null" !== e);
        return t.length ? t.join(", ") : "—"
    }
    prevPage() {
        this.state.currentPage > 1 && this.loadPage(this.state.currentPage - 1)
    }
    nextPage() {
        this.state.currentPage < this.state.totalPages && this.loadPage(this.state.currentPage + 1)
    }
    async loadPage(e) {
        const t = this.state.isSearching ? {
                ...this.state.searchParams,
                page: e,
                limit: 12
            } : {
                page: e,
                limit: 12
            },
            i = await window.electronAPI.getMovieList(t);
        this.handleApiResponse(i, e)
    }
    updatePagination() {
        const e = document.querySelector("#prevPage"),
            t = document.querySelector("#nextPage"),
            i = document.querySelector("#pageNumber");
        e && (e.disabled = this.state.currentPage <= 1), t && (t.disabled = this.state.currentPage >= this.state.totalPages), i && (i.textContent = this.state.currentPage)
    }
    updateStats() {
        const e = document.querySelector("#totalMovies"),
            t = document.querySelector("#currentPage");
        e && (e.textContent = this.state.totalMovies.toLocaleString()), t && (t.textContent = this.state.currentPage)
    }
    validateIdInput(e) {
        const t = e.target,
            i = document.querySelector("#idValidation");
        if (!t || !i) return;
        const a = t.value.replace(/\D/g, "");
        a !== t.value && (t.value = a), i.textContent = a ? "Ввод только цифр" : ""
    }
    setLoading(e) {
        const t = document.querySelector("#searchBtn");
        if (!t) return;
        const i = t.querySelector(".btn-text"),
            a = t.querySelector(".btn-loading");
        t.disabled = e, i && (i.style.display = e ? "none" : "inline"), a && (a.style.display = e ? "inline" : "none")
    }
    clearSearch() {
        ["#movieTitle", "#kinopoiskId", "#yearFilter"].forEach(e => {
            const t = document.querySelector(e);
            t && (t.value = "")
        }), ["#typeFilter", "#qualityFilter"].forEach(e => {
            const t = document.querySelector(e);
            t && (t.value = "")
        }), document.querySelector("#idValidation").textContent = "", this.state.searchParams = {}, this.state.isSearching = !1, this.loadMovies(1)
    }
    showToast(e) {
        const t = document.createElement("div");
        t.className = "toast", t.textContent = e, document.body.appendChild(t), setTimeout(() => t.remove(), 3e3)
    }
    showError(e) {
        this.showToast(`Ошибка: ${e}`)
    }
}
const movieApp = new MovieCatalogApp;