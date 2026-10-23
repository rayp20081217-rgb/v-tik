

    /* 2. APP ELEMENTS */

    const feed = byId("feed") || $(".feed");
    const searchInput = $(".search input, #searchInput, #search");
    const profileButton = byId("profileButton") || $(".profile-button");
    const mobileProfile = byId("mobileProfile");

    const createModal = byId("createModal") || byId("uploadModal");
    const commentsModal = byId("commentsModal");
    const viewer = byId("videoViewer") || byId("fullscreenViewer");

    const currentUser = {
        id: "vtik-current-user",
        username: "you",
        displayName: "V-Tik User",
        avatar: "😎"
    };

    /* 3. STORAGE */

    const STORAGE_KEY = "vtik_app_state_v1";
    const VIDEO_DB_NAME = "vtik_video_storage";
    const VIDEO_STORE_NAME = "videos";

    const defaultVideos = [
        {
            id: "demo-1",
            username: "vtik_creator",
            displayName: "V-Tik Creator",
            avatar: "✨",
            caption: "Welcome to V-Tik! Your next favorite video is here. 💖",
            music: "Original sound",
            src: "vtik-demo-1.mp4",
            likes: 128,
            comments: [{
                id: makeId(),
                username: "happyviewer",
                avatar: "😊",
                text: "Welcome to V-Tik! 🔥",
                createdAt: Date.now()
            }],
            liked: false,
            saved: false,
            following: false,
            createdAt: Date.now() - 3000
        },
        {
            id: "demo-2",
            username: "daily_vibes",
            displayName: "Daily Vibes",
            avatar: "🌈",
            caption: "A little positivity can change your whole day. 🌟",
            music: "Good vibes",
            src: "vtik-demo-2.mp4",
            likes: 245,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: Date.now() - 2000
        },
        {
            id: "demo-3",
            username: "creative_minds",
            displayName: "Creative Minds",
            avatar: "🎨",
            caption: "Keep creating. Keep learning. Keep shining. 🚀",
            music: "Creative energy",
            src: "vtik-demo-3.mp4",
            likes: 89,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: Date.now() - 1000
        }
    ];

    function loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);

            if (!saved) {
                return {
                    videos: defaultVideos.map((video) => ({ ...video })),
                    activeTab: "For You",
                    username: currentUser.username,
                    avatar: currentUser.avatar
                };
            }

            const parsed = JSON.parse(saved);

            return {
                videos: Array.isArray(parsed.videos)
                    ? parsed.videos
                    : defaultVideos.map((video) => ({ ...video })),
                activeTab: parsed.activeTab || "For You",
                username: parsed.username || currentUser.username,
                avatar: parsed.avatar || currentUser.avatar
            };
        } catch (error) {
            console.warn("V-Tik: could not load saved state.", error);

            return {
                videos: defaultVideos.map((video) => ({ ...video })),
                activeTab: "For You",
                username: currentUser.username,
                avatar: currentUser.avatar
            };
        }
    }

    const state = loadState();

    state.videos = state.videos.map((video) => ({
        comments: [],
        likes: 0,
        liked: false,
        saved: false,
        following: false,
        music: "Original sound",
        ...video,
        comments: Array.isArray(video.comments) ? video.comments : []
    }));

    let activeVideoId = null;
    let searchTerm = "";
    let currentObjectUrl = null;
    let dbPromise = null;
    let toastTimer = null;

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn("V-Tik: state could not be saved.", error);
            showToast("Some changes could not be saved on this device.");
        }
    }

    function getVideo(videoId) {
        return state.videos.find((video) => video.id === videoId);
    }

    function getCurrentAvatar() {
        return safeText(state.avatar, currentUser.avatar);
    }

    /* 4. VIDEO FILE DATABASE */

    function openVideoDB() {
        if (!("indexedDB" in window)) {
            return Promise.reject(new Error("IndexedDB is not supported in this browser."));
        }

        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(VIDEO_DB_NAME, 1);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
                    db.createObjectStore(VIDEO_STORE_NAME, { keyPath: "id" });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        return dbPromise;
    }

    async function saveVideoFile(id, file) {
        const db = await openVideoDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(VIDEO_STORE_NAME, "readwrite");

            transaction.objectStore(VIDEO_STORE_NAME).put({
                id,
                file,
                name: file.name,
                type: file.type
            });

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function getVideoFile(id) {
        const db = await openVideoDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(VIDEO_STORE_NAME, "readonly");
            const request = transaction.objectStore(VIDEO_STORE_NAME).get(id);

            request.onsuccess = () => {
                resolve(request.result ? request.result.file : null);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async function deleteVideoFile(id) {
        try {
            const db = await openVideoDB();

            await new Promise((resolve, reject) => {
                const transaction = db.transaction(VIDEO_STORE_NAME, "readwrite");
                transaction.objectStore(VIDEO_STORE_NAME).delete(id);
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) {
            console.warn("V-Tik: video file could not be deleted.", error);
        }
    }

    async function resolveVideoSource(video) {
        if (!video) return "";

        if (video.uploaded && video.id) {
            try {
                const file = await getVideoFile(video.id);
                if (file) return URL.createObjectURL(file);
            } catch (error) {
                console.warn("V-Tik: uploaded video unavailable.", error);
            }

            return "";
        }

        return video.src || "";
    }

    /* 5. TOAST NOTIFICATIONS */

    function showToast(message) {
        let toast = byId("vtikToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "vtikToast";
            toast.className = "vtik-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add("show");

        if (toastTimer) clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2600);
    }

    /* 6. VIDEO CARD HTML */

    function videoCardHTML(video) {
        const username = safeText(video.username, "creator");
        const displayName = safeText(video.displayName, username);
        const avatar = safeText(video.avatar, "🙂");
        const caption = safeText(video.caption, "");
        const music = safeText(video.music, "Original sound");

        return `
            <article class="video-card" data-video-id="${escapeHTML(video.id)}">
                <div class="video-user">
                    <div class="avatar">${escapeHTML(avatar)}</div>
                    <div class="video-user-info">
                        <strong>@${escapeHTML(username)}</strong>
                        <span>${escapeHTML(displayName)}</span>
                    </div>

                    <button class="follow-btn ${video.following ? "following" : ""}"
                            data-action="follow"
                            data-video-id="${escapeHTML(video.id)}"
                            type="button">
                        ${video.following ? "Following" : "Follow"}
                    </button>
                </div>

                <div class="video-stage">
                    <video class="feed-video"
                           data-video-id="${escapeHTML(video.id)}"
                           src=""
                           preload="metadata"
                           playsinline
                           muted
                           loop
                           controls
                           aria-label="Video by ${escapeHTML(username)}">
                    </video>

                    <div class="video-loading" aria-hidden="true">
                        <span></span>
                    </div>

                    <button class="sound-toggle"
                            data-action="sound"
                            type="button"
                            aria-label="Toggle video sound">
                        🔊
                    </button>
                </div>

                <div class="video-details">
                    <div class="video-caption">
                        <strong>@${escapeHTML(username)}</strong>
                        ${escapeHTML(caption)}
                    </div>

                    <div class="video-music">
                        <span aria-hidden="true">♫</span>
                        ${escapeHTML(music)}
                    </div>

                    <div class="video-actions">
                        <button class="action-btn ${video.liked ? "active liked" : ""}"
                                data-action="like"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Like video">
                            <span class="action-icon">${video.liked ? "♥" : "♡"}</span>
                            <span class="like-count">${formatCount(video.likes)}</span>
                        </button>

                        <button class="action-btn"
                                data-action="comment"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Open comments">
                            <span class="action-icon">▢</span>
                            <span>${formatCount(video.comments.length)}</span>
                        </button>

                        <button class="action-btn ${video.saved ? "active saved" : ""}"
                                data-action="save"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Save video">
                            <span class="action-icon">${video.saved ? "★" : "☆"}</span>
                            <span>${video.saved ? "Saved" : "Save"}</span>
                        </button>

                        <button class="action-btn"
                                data-action="share"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Share video">
                            <span class="action-icon">↗</span>
                            <span>Share</span>
                        </button>

                        <button class="action-btn"
                                data-action="expand"
                                data-video-id="${escapeHTML(video.id)}"
                                type="button"
                                aria-label="Open fullscreen viewer">
                            <span class="action-icon">⛶</span>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    /* 7. FEED FILTERING AND RENDERING */

    function getVisibleVideos() {
        let videos = [...state.videos];

        if (state.activeTab === "Following") {
            videos = videos.filter((video) => video.following);
        } else if (state.activeTab === "Saved") {
            videos = videos.filter((video) => video.saved);
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();

            videos = videos.filter((video) => {
                const searchable = [
                    video.username,
                    video.displayName,
                    video.caption,
                    video.music
                ].join(" ").toLowerCase();

                return searchable.includes(term);
            });
        }

        return videos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    function renderEmptyFeed(message) {
        if (!feed) return;

        feed.innerHTML = `
            <div class="empty-feed">
                <div class="empty-feed-icon">🎬</div>
                <h3>Nothing to show yet</h3>
                <p>${escapeHTML(message)}</p>
                <button class="btn btn-primary"
                        type="button"
                        data-action="open-create">
                    Create a video
                </button>
            </div>
        `;
    }

    function renderFeed() {
        if (!feed) {
            console.error('V-Tik: Add <main id="feed" class="feed"></main> to index.html.');
            showToast("Feed element is missing. Check index.html.");
            return;
        }

        const videos = getVisibleVideos();

        if (videos.length === 0) {
            let message = "Try another search or upload the first video.";

            if (state.activeTab === "Following") {
                message = "Follow creators to see their videos here.";
            } else if (state.activeTab === "Saved") {
                message = "Videos you save will appear here.";
            }

            renderEmptyFeed(message);
            updateProfileButton();
            return;
        }

        $$(".feed-video[data-object-url]", feed).forEach((oldVideo) => {
            const oldUrl = oldVideo.dataset.objectUrl;
            if (oldUrl) {
                try {
                    URL.revokeObjectURL(oldUrl);
                } catch (_) {}
            }
        });

        feed.innerHTML = videos.map(videoCardHTML).join("");
        updateProfileButton();

        setupVideoPlayback();
        loadFeedVideoSources();
    }

    async function loadFeedVideoSources() {
        const videoElements = $$(".feed-video", feed);

        for (const element of videoElements) {
            const videoId = element.dataset.videoId;
            const video = getVideo(videoId);
            if (!video) continue;

            const source = await resolveVideoSource(video);

            if (!element.isConnected) {
                if (source.startsWith("blob:")) URL.revokeObjectURL(source);
                continue;
            }

            if (!source) {
                element.poster = "";
                element.removeAttribute("src");
                element.load();

                const stage = element.closest(".video-stage");

                if (stage) {
                    stage.classList.add("video-unavailable");
                    let notice = $(".video-unavailable-message", stage);

                    if (!notice) {
                        notice = document.createElement("div");
                        notice.className = "video-unavailable-message";
                        notice.textContent = "Video file not found";
                        stage.appendChild(notice);
                    }
                }

                continue;
            }

            element.src = source;
            element.dataset.loaded = "true";
            element.classList.remove("video-source-error");
            element.load();

            if (source.startsWith("blob:")) {
                element.dataset.objectUrl = source;
            }

            const tryPlayWhenReady = () => {
                if (!element.isConnected || element.paused) {
                    const rect = element.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.height > 0 &&
                        rect.bottom > 0 && rect.top < window.innerHeight;

                    if (visible && element.isConnected) {
                        element.muted = true;
                        const playPromise = element.play();

                        if (playPromise && typeof playPromise.catch === "function") {
                            playPromise.catch(() => {});
                        }
                    }
                }
            };

            element.addEventListener("loadeddata", tryPlayWhenReady, { once: true });
        }
    }

    function setupVideoPlayback() {
        const videos = $$(".feed-video", feed);

        if (!("IntersectionObserver" in window)) {
            videos.forEach((video) => {
                video.muted = true;

                const rect = video.getBoundingClientRect();
                const visible = rect.width > 0 && rect.height > 0 &&
                    rect.bottom > 0 && rect.top < window.innerHeight;

                if (visible) {
                    const playPromise = video.play();
                    if (playPromise && typeof playPromise.catch === "function") {
                        playPromise.catch(() => {});
                    }
                }
            });
            return;
        }

        if (window.vtikVideoObserver) {
            window.vtikVideoObserver.disconnect();
        }

        window.vtikVideoObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const video = entry.target;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    videos.forEach((otherVideo) => {
                        if (otherVideo !== video) otherVideo.pause();
                    });

                    const playPromise = video.play();

                    if (playPromise && typeof playPromise.catch === "function") {
                        playPromise.catch(() => {});
                    }
                } else {
                    video.pause();
                }
            });
        }, { threshold: [0, 0.6, 1] });

        videos.forEach((video) => {
            video.muted = true;
            window.vtikVideoObserver.observe(video);
        });
    }
   
    /* ================================================
       PART 3 — HTML-COMPATIBLE CONTROLS AND INITIALIZATION
    ================================================= */

    /* 14. FULLSCREEN VIDEO VIEWER */

    async function openViewer(videoId) {
        const video = getVideo(videoId);
        const viewerElement = byId("videoViewer");
        const viewerVideo = byId("viewerVideo");

        if (!video) {
            showToast("Video not found.");
            return;
        }

        activeVideoId = videoId;

        if (!viewerElement || !viewerVideo) {
            const cardVideo = $(
                `.feed-video[data-video-id="${CSS.escape(String(videoId))}"]`
            );

            if (cardVideo?.requestFullscreen) {
                try {
                    await cardVideo.requestFullscreen();
                } catch {
                    showToast("Could not open fullscreen.");
                }
            } else {
                showToast("Fullscreen viewer is missing from the page.");
            }

            return;
        }

        viewerElement.dataset.videoId = videoId;

        const captionElement = byId("viewerCaption");
        const usernameElement = byId("viewerUsername");

        if (captionElement) {
            captionElement.textContent = video.caption || "";
        }

        if (usernameElement) {
            usernameElement.textContent = `@${video.username || "user"}`;
        }

        viewerVideo.pause();

        const source = await resolveVideoSource(video);

        if (!source) {
            showToast("Unable to load this video.");
            return;
        }

        viewerVideo.src = source;
        viewerVideo.loop = true;
        viewerVideo.playsInline = true;
        viewerVideo.muted = false;

        viewerElement.classList.add("active");
        viewerElement.setAttribute("aria-hidden", "false");

        viewerVideo.load();

        try {
            await viewerVideo.play();
        } catch {
            showToast("Tap the video to start playback.");
        }
    }

    function closeViewer() {
        const viewerElement = byId("videoViewer");
        const viewerVideo = byId("viewerVideo");

        if (viewerVideo) {
            viewerVideo.pause();
            viewerVideo.removeAttribute("src");
            viewerVideo.load();
        }

        if (viewerElement) {
            viewerElement.classList.remove("active");
            viewerElement.setAttribute("aria-hidden", "true");
        }

        activeVideoId = null;
    }

    /* 15. NAVIGATION — MATCHES data-section */

    function setActiveTab(sectionName) {
        const sectionMap = {
            home: "For You",
            discover: "Explore",
            following: "Following",
            liked: "Liked",
            saved: "Saved",
            messages: "Messages",
            trending: "Trending",
            music: "Music",
            gaming: "Gaming",
            challenges: "Challenges"
        };

        const section = String(sectionName || "home").toLowerCase();

        state.activeTab = sectionMap[section] || "For You";
        state.currentSection = section;

        $$("[data-section]").forEach((button) => {
            const isActive =
                button.dataset.section?.toLowerCase() === section;

            button.classList.toggle("active", isActive);

            if (isActive) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });

        saveState();
        renderFeed();
    }

    function bindNavigation() {
        $$("[data-section]").forEach((button) => {
            if (button.dataset.vtikNavigationBound) return;

            button.dataset.vtikNavigationBound = "true";

            button.addEventListener("click", (event) => {
                event.preventDefault();

                const section = button.dataset.section;
                if (section) setActiveTab(section);
            });
        });
    }

    /* 16. SEARCH */

    function bindSearch() {
        const input = byId("searchInput");
        const clearButton = byId("clearSearch");

        if (!input || input.dataset.vtikSearchBound) return;

        input.dataset.vtikSearchBound = "true";

        input.addEventListener("input", () => {
            searchTerm = input.value.trim();

            if (clearButton) {
                clearButton.hidden = !searchTerm;
            }

            renderFeed();
        });

        if (clearButton) {
            clearButton.addEventListener("click", () => {
                input.value = "";
                searchTerm = "";
                clearButton.hidden = true;
                input.focus();
                renderFeed();
            });
        }

        input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                input.value = "";
                searchTerm = "";

                if (clearButton) clearButton.hidden = true;

                renderFeed();
                input.blur();
            }
        });
    }

    /* 17. FEED ACTIONS */

    function bindFeedActions() {
        const feedElement = byId("feed");

        if (!feedElement || feedElement.dataset.vtikActionsBound) return;

        feedElement.dataset.vtikActionsBound = "true";

        feedElement.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-action]");

            if (!button || !feedElement.contains(button)) return;

            const card = button.closest("[data-video-id], [data-id]");

            const videoId =
                button.dataset.videoId
                || card?.dataset.videoId
                || card?.dataset.id;

            switch (button.dataset.action) {
                case "like":
                    if (videoId) toggleLike(videoId);
                    break;

                case "save":
                case "bookmark":
                    if (videoId) toggleSave(videoId);
                    break;

                case "follow":
                    if (videoId) toggleFollow(videoId);
                    break;

                case "comment":
                    if (videoId) openComments(videoId);
                    break;

                case "share":
                    if (videoId) await shareVideo(videoId);
                    break;

                case "expand":
                case "fullscreen":
                    if (videoId) await openViewer(videoId);
                    break;

                case "open-create":
                    openCreateModal();
                    break;

                default:
                    break;
            }
        });
    }

    /* 18. MODAL BUTTONS — MATCHES YOUR HTML */

    function bindModalControls() {
        const createButtonIds = [
            "createTop",
            "mobileCreate"
        ];

        createButtonIds.forEach((id) => {
            const button = byId(id);

            if (!button || button.dataset.vtikCreateBound) return;

            button.dataset.vtikCreateBound = "true";

            button.addEventListener("click", (event) => {
                event.preventDefault();
                openCreateModal();
            });
        });

        const closeCreate = byId("closeCreate");
        const closeComments = byId("closeComments");
        const viewerClose = byId("viewerClose");

        closeCreate?.addEventListener("click", () => {
            hideModal(byId("createModal"));
        });

        closeComments?.addEventListener("click", () => {
            hideModal(byId("commentsModal"));
        });

        viewerClose?.addEventListener("click", closeViewer);

        const createBackdrop = byId("createBackdrop");
        const commentsBackdrop = byId("commentsBackdrop");

        createBackdrop?.addEventListener("click", () => {
            hideModal(byId("createModal"));
        });

        commentsBackdrop?.addEventListener("click", () => {
            hideModal(byId("commentsModal"));
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;

            const viewerElement = byId("videoViewer");

            if (viewerElement?.classList.contains("active")) {
                closeViewer();
                return;
            }

            const createModalElement = byId("createModal");
            const commentsModalElement = byId("commentsModal");

            if (createModalElement?.classList.contains("active")) {
                hideModal(createModalElement);
            }

            if (commentsModalElement?.classList.contains("active")) {
                hideModal(commentsModalElement);
            }
        });
    }

    /* 19. VIDEO PLAYBACK ERROR HANDLING */

    function bindVideoErrors() {
        const feedElement = byId("feed");

        if (!feedElement || feedElement.dataset.vtikErrorsBound) return;

        feedElement.dataset.vtikErrorsBound = "true";

        feedElement.addEventListener("error", (event) => {
            const video = event.target;

            if (!(video instanceof HTMLVideoElement)) return;

            console.warn("V-Tik video failed to load:", video.currentSrc);
        }, true);
    }

    /* 20. INITIALIZE */

    function initializeVtik() {
        bindNavigation();
        bindSearch();
        bindFeedActions();
        bindModalControls();
        bindVideoErrors();

        if (typeof bindUploadForm === "function") {
            bindUploadForm();
        }

        if (typeof updateProfileButton === "function") {
            updateProfileButton();
        }

        setActiveTab(state.currentSection || "home");

        console.info("V-Tik is ready.");
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeVtik,
            { once: true }
        );
    } else {
        initializeVtik();
    }

})();

