
"use strict";

/* ============================================================
   V-TIK — COMPLETE VIDEO SHARING APPLICATION
   File structure:
   index.html
   style.css
   app.js
   vtik-demo-1.mp4
   vtik-demo-2.mp4
   vtik-demo-3.mp4

   FEATURES
   - Automatic playback for the video in view
   - Pause and rewind the previous video
   - TikTok-style vertical swipe navigation
   - Mouse wheel and keyboard feed navigation
   - Likes, comments, saves, follows and sharing
   - Search videos and creators
   - Upload videos using IndexedDB
   - Restore uploaded videos after refresh
   - Video preview before uploading
   - Video viewer and comments modal
   - Sound controls and double-click likes
   - Responsive event handling
============================================================ */

(() => {
    "use strict";

    /* ========================================================
       1. HELPERS AND DOM REFERENCES
    ======================================================== */

    const $ = (selector, root = document) =>
        root ? root.querySelector(selector) : null;

    const $$ = (selector, root = document) =>
        root ? Array.from(root.querySelectorAll(selector)) : [];

    const byId = (id) => document.getElementById(id);

    const feed = byId("feed");

    const createModal = byId("createModal");
    const commentsModal = byId("commentsModal");
    const videoViewer = byId("videoViewer");

    const videoPicker = byId("videoPicker");
    const uploadZone = byId("uploadZone");
    const previewContainer = byId("previewContainer");
    const uploadPreview = byId("uploadPreview");
    const uploadName = byId("uploadName");
    const videoCaption = byId("videoCaption");
    const postVideo = byId("postVideo");

    const searchInput = byId("searchInput");
    const clearSearch = byId("clearSearch");

    const DB_NAME = "vtik-video-database";
    const DB_VERSION = 1;
    const STORE_NAME = "uploadedVideos";

    const STORAGE_KEYS = {
        likes: "vtik_likes",
        saves: "vtik_saves",
        follows: "vtik_follows",
        comments: "vtik_comments",
        uploaded: "vtik_uploaded_metadata",
        muted: "vtik_muted",
        activeTab: "vtik_active_tab"
    };

    const DEMO_VIDEOS = [
        {
            id: "demo-1",
            src: "./vtik-demo-1.mp4",
            username: "vtik_creator",
            displayName: "V-Tik Creator",
            caption: "Welcome to V-Tik! Discover amazing videos.",
            music: "Original sound",
            likes: 1250,
            comments: 84,
            shares: 23,
            demo: true
        },
        {
            id: "demo-2",
            src: "./vtik-demo-2.mp4",
            username: "daily_moments",
            displayName: "Daily Moments",
            caption: "Enjoy the little moments in life.",
            music: "Original sound",
            likes: 842,
            comments: 42,
            shares: 17,
            demo: true
        },
        {
            id: "demo-3",
            src: "./vtik-demo-3.mp4",
            username: "trending_videos",
            displayName: "Trending Videos",
            caption: "What do you think about this video?",
            music: "Original sound",
            likes: 2360,
            comments: 120,
            shares: 65,
            demo: true
        }
    ];

    let videos = [];
    let activeVideo = null;
    let activeVideoId = null;
    let activeCommentVideoId = null;
    let previewObjectUrl = null;
    let dbPromise = null;
    let observer = null;
    let scrollLock = false;
    let wheelTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let lastTapTime = 0;
    let lastTapVideoId = null;
    let feedPointerStartY = 0;

    let muted = readStorage(STORAGE_KEYS.muted, true);

    const state = {
        likes: new Set(readStorage(STORAGE_KEYS.likes, [])),
        saves: new Set(readStorage(STORAGE_KEYS.saves, [])),
        follows: new Set(readStorage(STORAGE_KEYS.follows, [])),
        comments: readStorage(STORAGE_KEYS.comments, {}),
        activeTab: readStorage(STORAGE_KEYS.activeTab, "home"),
        search: "",
        uploading: false
    };

    /* ========================================================
       2. STORAGE HELPERS
    ======================================================== */

    function readStorage(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch (error) {
            console.warn(`V-Tik: Could not read ${key}.`, error);
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn(`V-Tik: Could not save ${key}.`, error);
        }
    }

    function persistState() {
        writeStorage(STORAGE_KEYS.likes, [...state.likes]);
        writeStorage(STORAGE_KEYS.saves, [...state.saves]);
        writeStorage(STORAGE_KEYS.follows, [...state.follows]);
        writeStorage(STORAGE_KEYS.comments, state.comments);
        writeStorage(STORAGE_KEYS.activeTab, state.activeTab);
        writeStorage(STORAGE_KEYS.muted, muted);
    }

    function escapeHTML(value = "") {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function formatCount(number) {
        const value = Number(number) || 0;

        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
        }

        if (value >= 1_000) {
            return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
        }

        return String(value);
    }

    function makeId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return `user-${window.crypto.randomUUID()}`;
        }

        return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function getVideo(id) {
        return videos.find((video) => video.id === id);
    }

    function getCard(id) {
        return $(`.video-card[data-video-id="${CSS.escape(id)}"]`, feed);
    }

    function showNotice(message) {
        let notice = byId("vtikNotice");

        if (!notice) {
            notice = document.createElement("div");
            notice.id = "vtikNotice";
            notice.className = "vtik-notice";
            notice.setAttribute("role", "status");
            document.body.appendChild(notice);
        }

        notice.textContent = message;
        notice.classList.add("show");

        clearTimeout(notice._hideTimer);
        notice._hideTimer = setTimeout(() => {
            notice.classList.remove("show");
        }, 2600);
    }

    function setButtonState(button, enabled, activeText, inactiveText) {
        if (!button) return;

        button.classList.toggle("active", enabled);
        button.setAttribute("aria-pressed", String(enabled));

        if (activeText && inactiveText) {
            button.setAttribute(
                "aria-label",
                enabled ? activeText : inactiveText
            );
        }
    }

    /* ========================================================
       3. INDEXEDDB — PERSIST UPLOADED VIDEOS
    ======================================================== */

    function openDatabase() {
        if (!("indexedDB" in window)) {
            return Promise.reject(
                new Error("This browser does not support IndexedDB.")
            );
        }

        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const database = request.result;

                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, {
                        keyPath: "id"
                    });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
                console.warn("V-Tik: Database upgrade is blocked.");
            };
        });

        return dbPromise;
    }

    async function saveUploadedVideo(video) {
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction(
                STORE_NAME,
                "readwrite"
            );

            transaction.objectStore(STORE_NAME).put(video);

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    }

    async function getUploadedVideos() {
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction(
                STORE_NAME,
                "readonly"
            );

            const request = transaction
                .objectStore(STORE_NAME)
                .getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteUploadedVideo(id) {
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction(
                STORE_NAME,
                "readwrite"
            );

            transaction.objectStore(STORE_NAME).delete(id);

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function restoreUploadedVideos() {
        try {
            const savedVideos = await getUploadedVideos();

            savedVideos.forEach((saved) => {
                const existing = videos.some(
                    (video) => video.id === saved.id
                );

                if (existing) return;

                const url = URL.createObjectURL(saved.blob);

                videos.push({
                    id: saved.id,
                    src: url,
                    username: saved.username || "you",
                    displayName: saved.displayName || "Your video",
                    caption: saved.caption || "",
                    music: saved.music || "Original sound",
                    likes: 0,
                    comments: 0,
                    shares: 0,
                    demo: false,
                    uploaded: true,
                    blob: saved.blob
                });
            });

            renderFeed();
            observeVideos();
        } catch (error) {
            console.error("V-Tik: Could not restore uploaded videos.", error);
            showNotice("Some saved videos could not be restored.");
        }
    }

    /* ========================================================
       4. VIDEO CARD TEMPLATE
    ======================================================== */

    function getCommentsCount(video) {
        const comments = state.comments[video.id] || [];
        return comments.length || Number(video.comments) || 0;
    }

    function getLikeCount(video) {
        const base = Number(video.likes) || 0;
        return base + (state.likes.has(video.id) ? 1 : 0);
    }

    function videoCardTemplate(video) {
        const liked = state.likes.has(video.id);
        const saved = state.saves.has(video.id);
        const following = state.follows.has(video.username);

        return `
            <article
                class="video-card"
                data-video-id="${escapeHTML(video.id)}"
                data-username="${escapeHTML(video.username)}"
            >
                <div class="video-stage">
                    <video
                        class="feed-video"
                        src="${escapeHTML(video.src)}"
                        playsinline
                        webkit-playsinline
                        preload="metadata"
                        muted
                        loop
                        aria-label="${escapeHTML(video.caption || "V-Tik video")}"
                    ></video>

                    <button
                        class="video-play-overlay"
                        type="button"
                        data-action="toggle-play"
                        aria-label="Play or pause video"
                    >
                        <span aria-hidden="true">▶</span>
                    </button>

                    <div class="video-top-bar">
                        <span class="video-brand">V-TIK</span>
                        <button
                            class="sound-toggle"
                            type="button"
                            data-action="sound"
                            aria-label="${muted ? "Turn sound on" : "Mute video"}"
                            aria-pressed="${!muted}"
                        >
                            ${muted ? "🔇" : "🔊"}
                        </button>
                    </div>

                    <div class="video-bottom-gradient"></div>

                    <div class="video-info">
                        <div class="video-creator">
                            <div class="creator-avatar">
                                ${escapeHTML(
                                    (video.displayName || video.username || "V")
                                        .charAt(0)
                                        .toUpperCase()
                                )}
                            </div>

                            <div class="creator-details">
                                <strong>@${escapeHTML(video.username)}</strong>
                                <span>${escapeHTML(video.displayName || video.username)}</span>
                            </div>

                            ${
                                video.username !== "you"
                                    ? `
                                        <button
                                            class="follow-btn ${following ? "active" : ""}"
                                            type="button"
                                            data-action="follow"
                                            aria-pressed="${following}"
                                        >
                                            ${following ? "Following" : "Follow"}
                                        </button>
                                    `
                                    : ""
                            }
                        </div>

                        <p class="video-caption">
                            ${escapeHTML(video.caption || "Enjoy this video!")}
                        </p>

                        <div class="video-music">
                            <span aria-hidden="true">♫</span>
                            <span>${escapeHTML(video.music || "Original sound")}</span>
                        </div>
                    </div>

                    <div class="video-actions">
                        <button
                            class="action-btn like-btn ${liked ? "active" : ""}"
                            type="button"
                            data-action="like"
                            aria-label="${liked ? "Unlike video" : "Like video"}"
                            aria-pressed="${liked}"
                        >
                            <span class="action-icon">${liked ? "♥" : "♡"}</span>
                            <span class="action-count">${formatCount(getLikeCount(video))}</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="comment"
                            aria-label="View comments"
                        >
                            <span class="action-icon">💬</span>
                            <span class="action-count">${formatCount(getCommentsCount(video))}</span>
                        </button>

                        <button
                            class="action-btn save-btn ${saved ? "active" : ""}"
                            type="button"
                            data-action="save"
                            aria-label="${saved ? "Remove saved video" : "Save video"}"
                            aria-pressed="${saved}"
                        >
                            <span class="action-icon">${saved ? "🔖" : "♧"}</span>
                            <span class="action-count">${saved ? "Saved" : "Save"}</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="share"
                            aria-label="Share video"
                        >
                            <span class="action-icon">↗</span>
                            <span class="action-count">Share</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="expand"
                            aria-label="Open video viewer"
                        >
                            <span class="action-icon">⛶</span>
                            <span class="action-count">View</span>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    /* ========================================================
       5. RENDER AND FILTER THE FEED
    ======================================================== */

    function getVisibleVideos() {
        let result = [...videos];

        if (state.activeTab === "following") {
            result = result.filter((video) =>
                state.follows.has(video.username)
            );
        } else if (state.activeTab === "saved") {
            result = result.filter((video) =>
                state.saves.has(video.id)
            );
        }

        const query = state.search.trim().toLowerCase();

        if (query) {
            result = result.filter((video) => {
                const searchable = [
                    video.caption,
                    video.username,
                    video.displayName,
                    video.music
                ].join(" ").toLowerCase();

                return searchable.includes(query);
            });
        }

        return result;
    }

    function renderFeed() {
        if (!feed) return;

        const previousId = activeVideoId;
        const visibleVideos = getVisibleVideos();

        if (!visibleVideos.length) {
            feed.innerHTML = `
                <div class="feed-empty">
                    <div class="feed-empty-icon">🎬</div>
                    <h3>No videos found</h3>
                    <p>
                        ${
                            state.search
                                ? "Try another search."
                                : "Upload a video or choose another section."
                        }
                    </p>
                    <button type="button" data-action="open-create">
                        Upload a video
                    </button>
                </div>
            `;

            activeVideo = null;
            activeVideoId = null;
            return;
        }

        feed.innerHTML = visibleVideos.map(videoCardTemplate).join("");

        if (previousId) {
            const previousCard = getCard(previousId);

            if (previousCard) {
                previousCard.scrollIntoView({
                    behavior: "auto",
                    block: "start"
                });
            }
        }

        observeVideos();
    }

    /* ========================================================
       6. AUTOPLAY AND PAUSE/REWIND
    ======================================================== */

    function resetVideo(video) {
        if (!video) return;

        video.pause();

        try {
            video.currentTime = 0;
        } catch (_) {
            // The video may not have loaded metadata yet.
        }
    }

    function stopAllVideos(except = null) {
        $$(".feed-video", feed).forEach((video) => {
            if (video !== except) {
                resetVideo(video);
            }
        });
    }

    async function playViewedVideo(video) {
        if (!video) return;

        const card = video.closest(".video-card");
        if (!card) return;

        const id = card.dataset.videoId;

        if (activeVideo && activeVideo !== video) {
            resetVideo(activeVideo);
        }

        $$(".feed-video", feed).forEach((otherVideo) => {
            if (otherVideo !== video) {
                resetVideo(otherVideo);
            }
        });

        activeVideo = video;
        activeVideoId = id;

        video.muted = muted;
        video.loop = true;
        video.playsInline = true;

        try {
            await video.play();
            card.classList.add("is-playing");
            card.classList.remove("is-paused");
        } catch (error) {
            card.classList.remove("is-playing");
            card.classList.add("is-paused");

            // Autoplay may require muted playback or a user gesture.
            if (!muted && error.name === "NotAllowedError") {
                video.muted = true;

                try {
                    await video.play();
                    card.classList.add("is-playing");
                    card.classList.remove("is-paused");
                } catch (_) {
                    // Show the play control if playback remains blocked.
                }
            }
        }

        updatePlayOverlay(card, video);
    }

    function updatePlayOverlay(card, video) {
        const button = $(".video-play-overlay", card);
        if (!button) return;

        const paused = video.paused;

        button.classList.toggle("visible", paused);
        button.setAttribute(
            "aria-label",
            paused ? "Play video" : "Pause video"
        );

        const symbol = $("span", button);
        if (symbol) symbol.textContent = paused ? "▶" : "Ⅱ";
    }

    function observeVideos() {
        if (!feed) return;

        if (observer) {
            observer.disconnect();
        }

        if (!("IntersectionObserver" in window)) {
            const firstVideo = $(".feed-video", feed);
            if (firstVideo) playViewedVideo(firstVideo);
            return;
        }

        observer = new IntersectionObserver((entries) => {
            const candidates = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

            const best = candidates[0];

            if (best && best.intersectionRatio >= 0.60) {
                const video = $("video", best.target);

                if (video && video !== activeVideo) {
                    playViewedVideo(video);
                }
            }
        }, {
            root: feed,
            threshold: [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]
        });

        $$(".video-card", feed).forEach((card) => {
            observer.observe(card);
        });

        // If a feed container isn't independently scrollable,
        // use the viewport as a fallback.
        if (getComputedStyle(feed).overflowY === "visible") {
            observer.disconnect();

            observer = new IntersectionObserver((entries) => {
                const candidates = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

                const best = candidates[0];

                if (best && best.intersectionRatio >= 0.60) {
                    const video = $("video", best.target);
                    if (video && video !== activeVideo) {
                        playViewedVideo(video);
                    }
                }
            }, {
                threshold: [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]
            });

            $$(".video-card", feed).forEach((card) => {
                observer.observe(card);
            });
        }
    }

    function refreshPlayback() {
        if (!feed) return;

        const cards = $$(".video-card", feed);

        if (!cards.length) {
            stopAllVideos();
            return;
        }

        const rootRect = feed.getBoundingClientRect();
        const useViewport =
            getComputedStyle(feed).overflowY === "visible";

        const area = useViewport
            ? {
                top: 0,
                bottom: window.innerHeight,
                height: window.innerHeight
            }
            : {
                top: rootRect.top,
                bottom: rootRect.bottom,
                height: rootRect.height
            };

        let bestCard = null;
        let bestRatio = 0;

        cards.forEach((card) => {
            const rect = card.getBoundingClientRect();
            const visibleHeight = Math.max(
                0,
                Math.min(rect.bottom, area.bottom) -
                Math.max(rect.top, area.top)
            );

            const ratio = rect.height > 0
                ? visibleHeight / rect.height
                : 0;

            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestCard = card;
            }
        });

        if (bestCard && bestRatio >= 0.60) {
            const video = $("video", bestCard);
            if (video && video !== activeVideo) {
                playViewedVideo(video);
            }
        }
    }

    /* ========================================================
       7. VERTICAL SWIPE NAVIGATION
    ======================================================== */

    function bindVerticalSwipeNavigation() {
        if (!feed) return;

        feed.addEventListener("touchstart", (event) => {
            if (!event.touches.length) return;

            const target = event.target;

            if (target.closest(
                "button, input, textarea, select, a, .modal, .viewer"
            )) {
                touchStartY = 0;
                return;
            }

            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });

        feed.addEventListener("touchend", (event) => {
            if (!touchStartY || !event.changedTouches.length) return;

            const endX = event.changedTouches[0].clientX;
            const endY = event.changedTouches[0].clientY;

            const deltaX = endX - touchStartX;
            const deltaY = endY - touchStartY;
            const duration = Date.now() - touchStartTime;

            touchStartY = 0;

            // Ignore horizontal swipes and small movements.
            if (Math.abs(deltaY) < 55) return;
            if (Math.abs(deltaX) > Math.abs(deltaY) * 0.8) return;
            if (duration > 900) return;

            navigateFeed(deltaY < 0 ? 1 : -1);
        }, { passive: true });

        // Desktop trackpads and mouse wheels.
        feed.addEventListener("wheel", (event) => {
            if (Math.abs(event.deltaY) < 35) return;
            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

            if (event.target.closest(
                "button, input, textarea, select, .modal, .viewer"
            )) {
                return;
            }

            if (scrollLock) return;

            navigateFeed(event.deltaY > 0 ? 1 : -1);
        }, { passive: true });

        // Keyboard navigation.
        document.addEventListener("keydown", (event) => {
            if (isTypingTarget(event.target)) return;
            if (isModalOpen()) return;

            if (event.key === "ArrowDown" || event.key === "PageDown") {
                event.preventDefault();
                navigateFeed(1);
            }

            if (event.key === "ArrowUp" || event.key === "PageUp") {
                event.preventDefault();
                navigateFeed(-1);
            }

            if (event.code === "Space") {
                const video = activeVideo;

                if (video && feed.contains(video)) {
                    event.preventDefault();
                    toggleVideoPlayback(video);
                }
            }
        });
    }

    function navigateFeed(direction) {
        if (!feed || scrollLock) return;

        const cards = $$(".video-card", feed);
        if (!cards.length) return;

        let index = cards.findIndex(
            (card) => card.dataset.videoId === activeVideoId
        );

        if (index < 0) index = 0;

        const nextIndex = Math.max(
            0,
            Math.min(cards.length - 1, index + direction)
        );

        if (nextIndex === index) return;

        scrollLock = true;

        const nextCard = cards[nextIndex];

        nextCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        const nextVideo = $("video", nextCard);

        if (nextVideo) {
            playViewedVideo(nextVideo);
        }

        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => {
            scrollLock = false;
            refreshPlayback();
        }, 650);
    }

    function isTypingTarget(target) {
        return Boolean(target.closest(
            "input, textarea, select, [contenteditable='true']"
        ));
    }

    function isModalOpen() {
        return [createModal, commentsModal, videoViewer].some((modal) =>
            modal && modal.classList.contains("active")
        );
    }

    /* ========================================================
       8. PLAY / PAUSE AND SOUND
    ======================================================== */

    async function toggleVideoPlayback(video) {
        if (!video) return;

        if (video.paused) {
            await playViewedVideo(video);
        } else {
            video.pause();

            const card = video.closest(".video-card");
            if (card) {
                card.classList.remove("is-playing");
                card.classList.add("is-paused");
                updatePlayOverlay(card, video);
            }
        }
    }

    function toggleSound(video, button) {
        if (!video) return;

        muted = !muted;
        writeStorage(STORAGE_KEYS.muted, muted);

        $$(".feed-video", feed).forEach((item) => {
            item.muted = muted;
        });

        if (videoViewer) {
            const viewerVideo = $("video", videoViewer);
            if (viewerVideo) viewerVideo.muted = muted;
        }

        $$(".sound-toggle").forEach((toggle) => {
            toggle.textContent = muted ? "🔇" : "🔊";
            toggle.setAttribute(
                "aria-label",
                muted ? "Turn sound on" : "Mute video"
            );
            toggle.setAttribute("aria-pressed", String(!muted));
        });

        if (button) {
            button.textContent = muted ? "🔇" : "🔊";
        }

        if (!muted && video.paused) {
            playViewedVideo(video);
        }
    }

    /* ========================================================
       9. LIKES, SAVES AND FOLLOWS
    ======================================================== */

    function toggleLike(id) {
        const video = getVideo(id);
        if (!video) return;

        if (state.likes.has(id)) {
            state.likes.delete(id);
        } else {
            state.likes.add(id);
        }

        persistState();
        updateCardActions(id);
    }

    function toggleSave(id) {
        if (!getVideo(id)) return;

        if (state.saves.has(id)) {
            state.saves.delete(id);
            showNotice("Removed from saved videos.");
        } else {
            state.saves.add(id);
            showNotice("Video saved!");
        }

        persistState();
        updateCardActions(id);

        if (state.activeTab === "saved") {
            renderFeed();
        }
    }

    function toggleFollow(username) {
        if (!username) return;

        if (state.follows.has(username)) {
            state.follows.delete(username);
            showNotice(`Unfollowed @${username}`);
        } else {
            state.follows.add(username);
            showNotice(`Following @${username}`);
        }

        persistState();

        if (state.activeTab === "following") {
            renderFeed();
        } else {
            $$(".video-card", feed).forEach((card) => {
                if (card.dataset.username !== username) return;

                const button = $('[data-action="follow"]', card);
                if (!button) return;

                const following = state.follows.has(username);
                button.textContent = following ? "Following" : "Follow";
                button.classList.toggle("active", following);
                button.setAttribute("aria-pressed", String(following));
            });
        }
    }

    function updateCardActions(id) {
        const video = getVideo(id);
        const card = getCard(id);

        if (!video || !card) return;

        const likeButton = $('[data-action="like"]', card);
        const saveButton = $('[data-action="save"]', card);
        const commentButton = $('[data-action="comment"]', card);

        const liked = state.likes.has(id);
        const saved = state.saves.has(id);

        if (likeButton) {
            likeButton.classList.toggle("active", liked);
            likeButton.setAttribute("aria-pressed", String(liked));
            likeButton.setAttribute(
                "aria-label",
                liked ? "Unlike video" : "Like video"
            );

            $(".action-icon", likeButton).textContent = liked ? "♥" : "♡";
            $(".action-count", likeButton).textContent =
                formatCount(getLikeCount(video));
        }

        if (saveButton) {
            saveButton.classList.toggle("active", saved);
            saveButton.setAttribute("aria-pressed", String(saved));
            saveButton.setAttribute(
                "aria-label",
                saved ? "Remove saved video" : "Save video"
            );

            $(".action-icon", saveButton).textContent = saved ? "🔖" : "♧";
            $(".action-count", saveButton).textContent =
                saved ? "Saved" : "Save";
        }

        if (commentButton) {
            $(".action-count", commentButton).textContent =
                formatCount(getCommentsCount(video));
        }
    }

    /* ========================================================
       10. COMMENTS
    ======================================================== */

    function getVideoComments(id) {
        if (!Array.isArray(state.comments[id])) {
            state.comments[id] = [];
        }

        return state.comments[id];
    }

    function openComments(id) {
        const video = getVideo(id);
        if (!video || !commentsModal) {
            showNotice("Comments are unavailable.");
            return;
        }

        activeCommentVideoId = id;

        const title = $("[data-comments-title]", commentsModal);
        if (title) {
            title.textContent = `Comments · @${video.username}`;
        }

        renderComments(id);
        openModal(commentsModal);

        const input = $(
            "#commentInput, [name='comment'], [data-comment-input]",
            commentsModal
        );

        if (input) {
            setTimeout(() => input.focus(), 100);
        }
    }

    function renderComments(id) {
        if (!commentsModal) return;

        const comments = getVideoComments(id);

        const list = $(
            "#commentsList, [data-comments-list], .comments-list",
            commentsModal
        );

        if (list) {
            if (!comments.length) {
                list.innerHTML = `
                    <div class="comments-empty">
                        <p>No comments yet.</p>
                        <span>Be the first to comment!</span>
                    </div>
                `;
            } else {
                list.innerHTML = comments.map((comment) => `
                    <div class="comment-item">
                        <div class="comment-avatar">
                            ${escapeHTML(
                                (comment.username || "you").charAt(0).toUpperCase()
                            )}
                        </div>
                        <div class="comment-content">
                            <strong>@${escapeHTML(comment.username || "you")}</strong>
                            <p>${escapeHTML(comment.text)}</p>
                            <small>${escapeHTML(comment.time || "Just now")}</small>
                        </div>
                    </div>
                `).join("");
            }
        }

        const count = $("[data-comment-count]", commentsModal);
        if (count) count.textContent = String(comments.length);
    }

    function addComment(text) {
        const id = activeCommentVideoId;
        if (!id || !text || !text.trim()) return;

        const comments = getVideoComments(id);

        comments.push({
            id: makeId(),
            username: "you",
            text: text.trim(),
            time: new Date().toLocaleString()
        });

        persistState();
        renderComments(id);
        updateCardActions(id);

        const input = $(
            "#commentInput, [name='comment'], [data-comment-input]",
            commentsModal
        );

        if (input) input.value = "";
    }

    /* ========================================================
       11. SHARING
    ======================================================== */

    async function shareVideo(id) {
        const video = getVideo(id);
        if (!video) return;

        const shareData = {
            title: "V-Tik video",
            text: video.caption || `Watch @${video.username} on V-Tik`,
            url: window.location.href.split("#")[0] + `#video-${encodeURIComponent(id)}`
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(shareData.url);
                showNotice("Video link copied!");
            } else {
                showShareFallback(shareData.url);
            }

            video.shares = (Number(video.shares) || 0) + 1;
        } catch (error) {
            if (error.name !== "AbortError") {
                showShareFallback(shareData.url);
            }
        }
    }

    function showShareFallback(url) {
        const copied = window.prompt(
            "Copy this link to share the video:",
            url
        );

        if (copied !== null) {
            showNotice("Copy the link to share this video.");
        }
    }

    /* ========================================================
       12. FULL VIDEO VIEWER
    ======================================================== */

    function openViewer(id) {
        const video = getVideo(id);
        if (!video || !videoViewer) return;

        const viewerVideo = $(
            "video, [data-viewer-video]",
            videoViewer
        );

        if (viewerVideo && viewerVideo.tagName === "VIDEO") {
            viewerVideo.src = video.src;
            viewerVideo.muted = muted;
            viewerVideo.loop = true;
            viewerVideo.playsInline = true;

            viewerVideo.play().catch(() => {
                // Playback may require a user gesture.
            });
        }

        const caption = $("[data-viewer-caption]", videoViewer);
        if (caption) caption.textContent = video.caption || "";

        const username = $("[data-viewer-username]", videoViewer);
        if (username) username.textContent = `@${video.username}`;

        openModal(videoViewer);
    }

    function closeViewer() {
        if (!videoViewer) return;

        const video = $("video", videoViewer);
        if (video) {
            video.pause();
            video.removeAttribute("src");
            video.load();
        }

        closeModal(videoViewer);
        refreshPlayback();
    }

    /* ========================================================
       13. MODALS
    ======================================================== */

    function openModal(modal) {
        if (!modal) return;

        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");

        const firstInput = $("input, textarea", modal);
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 80);
        }
    }

    function closeModal(modal) {
        if (!modal) return;

        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");

        const anyOpen = [createModal, commentsModal, videoViewer].some(
            (item) => item && item.classList.contains("active")
        );

        if (!anyOpen) {
            document.body.classList.remove("modal-open");
        }
    }

    function openCreateModal() {
        if (!createModal) {
            showNotice("Upload form was not found in the HTML.");
            return;
        }

        openModal(createModal);
    }

    /* ========================================================
       14. VIDEO UPLOAD AND PREVIEW
    ======================================================== */

    function resetUploadForm() {
        if (videoPicker) videoPicker.value = "";
        if (videoCaption) videoCaption.value = "";
        if (uploadName) uploadName.textContent = "";

        if (uploadPreview) {
            uploadPreview.pause();
            uploadPreview.removeAttribute("src");
            uploadPreview.load();
        }

        if (previewContainer) {
            previewContainer.hidden = true;
        }

        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
    }

    function previewSelectedFile(file) {
        if (!file) return;

        if (!file.type.startsWith("video/")) {
            showNotice("Please select a video file.");
            return;
        }

        const maxSize = 250 * 1024 * 1024;

        if (file.size > maxSize) {
            showNotice("Video is too large. Maximum size is 250 MB.");
            return;
        }

        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
        }

        previewObjectUrl = URL.createObjectURL(file);

        if (uploadPreview) {
            uploadPreview.src = previewObjectUrl;
            uploadPreview.muted = true;
            uploadPreview.playsInline = true;
            uploadPreview.load();
        }

        if (uploadName) {
            uploadName.textContent = file.name;
        }

        if (previewContainer) {
            previewContainer.hidden = false;
        }
    }

    async function uploadVideo() {
        if (state.uploading) return;

        const file = videoPicker?.files?.[0];

        if (!file) {
            showNotice("Choose a video before uploading.");
            return;
        }

        if (!file.type.startsWith("video/")) {
            showNotice("Please choose a valid video file.");
            return;
        }

        state.uploading = true;

        if (postVideo) {
            postVideo.disabled = true;
            postVideo.textContent = "Uploading...";
        }

        const id = makeId();
        const caption = videoCaption?.value?.trim() || "";
        const savedVideo = {
            id,
            blob: file,
            username: "you",
            displayName: "Your video",
            caption,
            music: "Original sound",
            createdAt: Date.now()
        };

        try {
            // Store the original file so it can be restored after refresh.
            await saveUploadedVideo(savedVideo);

            const src = URL.createObjectURL(file);

            videos.unshift({
                id,
                src,
                username: "you",
                displayName: "Your video",
                caption,
                music: "Original sound",
                likes: 0,
                comments: 0,
                shares: 0,
                demo: false,
                uploaded: true,
                blob: file
            });

            persistState();
            state.search = "";

            if (searchInput) searchInput.value = "";
            closeModal(createModal);
            resetUploadForm();

            state.activeTab = "home";
            renderFeed();

            const newCard = getCard(id);

            if (newCard) {
                newCard.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                const newVideo = $("video", newCard);
                if (newVideo) playViewedVideo(newVideo);
            }

            showNotice("Your video was uploaded successfully!");
        } catch (error) {
            console.error("V-Tik upload error:", error);
            showNotice(
                "Upload failed. Check browser storage and try again."
            );
        } finally {
            state.uploading = false;

            if (postVideo) {
                postVideo.disabled = false;
                postVideo.textContent = "Post video";
            }
        }
    }

    /* ========================================================
       15. SEARCH
    ======================================================== */

    function bindSearch() {
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                state.search = searchInput.value.trim();
                renderFeed();
            });
        }

        if (clearSearch) {
            clearSearch.addEventListener("click", () => {
                if (searchInput) {
                    searchInput.value = "";
                    searchInput.focus();
                }

                state.search = "";
                renderFeed();
            });
        }
    }

    /* ========================================================
       16. NAVIGATION
    ======================================================== */

    function setActiveTab(tab) {
        const allowedTabs = ["home", "following", "saved"];

        if (!allowedTabs.includes(tab)) {
            tab = "home";
        }

        state.activeTab = tab;
        persistState();

        $$("[data-section]").forEach((item) => {
            const selected = item.dataset.section === tab;

            item.classList.toggle("active", selected);

            if (item.matches("button, a")) {
                item.setAttribute("aria-current", selected ? "page" : "false");
            }
        });

        renderFeed();
    }

    function bindNavigation() {
        document.addEventListener("click", (event) => {
            const navigation = event.target.closest("[data-section]");
            if (!navigation) return;

            event.preventDefault();
            setActiveTab(navigation.dataset.section);
        });
    }

    /* ========================================================
       17. FEED ACTIONS
    ======================================================== */

    function bindFeedActions() {
        if (!feed) return;

        feed.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action]");

            if (!button) {
                const stage = event.target.closest(".video-stage");
                if (!stage) return;

                // Tapping the video toggles playback.
                if (
                    event.target.closest("video") ||
                    event.target.classList.contains("video-stage")
                ) {
                    const video = $("video", stage);
                    if (video) toggleVideoPlayback(video);
                }

                return;
            }

            const card = button.closest(".video-card");
            const id = card?.dataset.videoId;
            const action = button.dataset.action;

            if (action === "open-create") {
                openCreateModal();
                return;
            }

            if (!id && action !== "open-create") return;

            const video = getVideo(id);

            switch (action) {
                case "like":
                    toggleLike(id);
                    break;

                case "comment":
                    openComments(id);
                    break;

                case "save":
                    toggleSave(id);
                    break;

                case "follow":
                    toggleFollow(video?.username);
                    break;

                case "share":
                    shareVideo(id);
                    break;

                case "expand":
                    openViewer(id);
                    break;

                case "sound":
                    toggleSound($("video", card), button);
                    break;

                case "toggle-play":
                    toggleVideoPlayback($("video", card));
                    break;
            }
        });

        // Double-click a video to like it.
        feed.addEventListener("click", (event) => {
            if (event.target.closest("button")) return;

            const card = event.target.closest(".video-card");
            if (!card) return;

            const video = $("video", card);
            if (!video) return;

            const id = card.dataset.videoId;
            const now = Date.now();

            if (
                lastTapVideoId === id &&
                now - lastTapTime < 350
            ) {
                if (!state.likes.has(id)) {
                    toggleLike(id);
                }

                showLikeAnimation(card);
                lastTapTime = 0;
                lastTapVideoId = null;
                return;
            }

            lastTapTime = now;
            lastTapVideoId = id;
        });

        // Keep the play overlay accurate after native video controls.
        feed.addEventListener("play", (event) => {
            if (!event.target.matches("video")) return;

            const card = event.target.closest(".video-card");
            if (card) updatePlayOverlay(card, event.target);
        }, true);

        feed.addEventListener("pause", (event) => {
            if (!event.target.matches("video")) return;

            const card = event.target.closest(".video-card");

            if (card) {
                card.classList.remove("is-playing");
                card.classList.add("is-paused");
                updatePlayOverlay(card, event.target);
            }
        }, true);
    }

    function showLikeAnimation(card) {
        const animation = document.createElement("div");

        animation.className = "vtik-like-animation";
        animation.textContent = "♥";
        animation.setAttribute("aria-hidden", "true");

        card.appendChild(animation);

        setTimeout(() => animation.remove(), 750);
    }

    /* ========================================================
       18. MODAL AND UPLOAD EVENT BINDINGS
    ======================================================== */

    function bindModalActions() {
        document.addEventListener("click", (event) => {
            const closeButton = event.target.closest(
                "[data-close-modal], .modal-close, .viewer-close"
            );

            if (closeButton) {
                const modal = closeButton.closest(
                    ".modal, .viewer, [role='dialog']"
                );

                if (modal) {
                    if (modal === videoViewer) {
                        closeViewer();
                    } else {
                        closeModal(modal);
                    }
                }

                return;
            }

            // Clicking the modal backdrop closes it.
            [createModal, commentsModal, videoViewer].forEach((modal) => {
                if (modal && event.target === modal) {
                    if (modal === videoViewer) {
                        closeViewer();
                    } else {
                        closeModal(modal);
                    }
                }
            });

            const createButton = event.target.closest(
                '[data-action="open-create"], #openCreate, #createButton'
            );

            if (createButton) {
                event.preventDefault();
                openCreateModal();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;

            if (videoViewer?.classList.contains("active")) {
                closeViewer();
            } else if (commentsModal?.classList.contains("active")) {
                closeModal(commentsModal);
            } else if (createModal?.classList.contains("active")) {
                closeModal(createModal);
            }
        });

        if (videoPicker) {
            videoPicker.addEventListener("change", () => {
                previewSelectedFile(videoPicker.files?.[0]);
            });
        }

        if (uploadZone) {
            uploadZone.addEventListener("click", (event) => {
                if (event.target === videoPicker) return;
                videoPicker?.click();
            });

            uploadZone.addEventListener("dragover", (event) => {
                event.preventDefault();
                uploadZone.classList.add("drag-over");
            });

            uploadZone.addEventListener("dragleave", () => {
                uploadZone.classList.remove("drag-over");
            });

            uploadZone.addEventListener("drop", (event) => {
                event.preventDefault();
                uploadZone.classList.remove("drag-over");

                const file = event.dataTransfer?.files?.[0];
                if (!file) return;

                if (videoPicker) {
                    try {
                        const transfer = new DataTransfer();
                        transfer.items.add(file);
                        videoPicker.files = transfer.files;
                    } catch (_) {
                        // Preview can still work if file assignment is blocked.
                    }
                }

                previewSelectedFile(file);
            });
        }

        if (postVideo) {
            postVideo.addEventListener("click", (event) => {
                event.preventDefault();
                uploadVideo();
            });
        }

        if (commentsModal) {
            commentsModal.addEventListener("submit", (event) => {
                const form = event.target.closest(
                    "#commentForm, [data-comment-form], .comment-form"
                );

                if (!form) return;

                event.preventDefault();

                const input = $(
                    "#commentInput, [name='comment'], [data-comment-input]",
                    form
                );

                if (input) addComment(input.value);
            });
        }

        // Also support comment forms without a submit event.
        document.addEventListener("click", (event) => {
            const submit = event.target.closest(
                "#submitComment, [data-submit-comment]"
            );

            if (!submit) return;

            const input = $(
                "#commentInput, [name='comment'], [data-comment-input]",
                commentsModal
            );

            if (input) addComment(input.value);
        });
    }

    /* ========================================================
       19. OPTIONAL DELETE ACTION FOR UPLOADED VIDEOS
    ======================================================== */

    async function deleteVideo(id) {
        const video = getVideo(id);

        if (!video || !video.uploaded) {
            showNotice("Only your uploaded videos can be deleted here.");
            return;
        }

        const confirmed = window.confirm(
            "Delete this uploaded video from V-Tik?"
        );

        if (!confirmed) return;

        try {
            await deleteUploadedVideo(id);

            if (activeVideoId === id) {
                stopAllVideos();
                activeVideo = null;
                activeVideoId = null;
            }

            if (video.src && video.src.startsWith("blob:")) {
                URL.revokeObjectURL(video.src);
            }

            videos = videos.filter((item) => item.id !== id);

            state.likes.delete(id);
            state.saves.delete(id);
            delete state.comments[id];

            persistState();
            renderFeed();

            showNotice("Video deleted.");
        } catch (error) {
            console.error("V-Tik: Could not delete video.", error);
            showNotice("Could not delete this video.");
        }
    }

    /* ========================================================
       20. PAGE VISIBILITY AND RESIZE
    ======================================================== */

    function bindPageLifecycle() {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                stopAllVideos();
                return;
            }

            refreshPlayback();
        });

        window.addEventListener("resize", () => {
            refreshPlayback();
        });

        window.addEventListener("orientationchange", () => {
            setTimeout(refreshPlayback, 250);
        });

        if (feed) {
            let scrollTimer = null;

            feed.addEventListener("scroll", () => {
                clearTimeout(scrollTimer);

                scrollTimer = setTimeout(() => {
                    refreshPlayback();
                    scrollLock = false;
                }, 120);
            }, { passive: true });
        } else {
            let scrollTimer = null;

            window.addEventListener("scroll", () => {
                clearTimeout(scrollTimer);

                scrollTimer = setTimeout(refreshPlayback, 120);
            }, { passive: true });
        }
    }

    /* ========================================================
       21. OPTIONAL GLOBAL API
       Useful for buttons or HTML integrations.
    ======================================================== */

    window.VTik = {
        get videos() {
            return [...videos];
        },
        playVideo(id) {
            const card = getCard(id);
            const video = card && $("video", card);

            if (video) playViewedVideo(video);
        },
        likeVideo: toggleLike,
        saveVideo: toggleSave,
        followUser: toggleFollow,
        openComments,
        openViewer,
        closeViewer,
        openCreateModal,
        setActiveTab,
        deleteVideo,
        refreshPlayback
    };

    /* ========================================================
       22. INITIALIZATION
    ======================================================== */

    async function initializeVtik() {
        if (!feed) {
            console.error(
                'V-Tik: Could not find the element with id="feed".'
            );
            return;
        }

        videos = DEMO_VIDEOS.map((video) => ({ ...video }));

        // Ensure feed and video cards can be navigated vertically.
        feed.style.scrollBehavior = "smooth";

        $$(".feed-video", feed).forEach((video) => {
            video.muted = muted;
            video.loop = true;
            video.playsInline = true;
        });

        bindSearch();
        bindNavigation();
        bindFeedActions();
        bindModalActions();
        bindVerticalSwipeNavigation();
        bindPageLifecycle();

        renderFeed();

        // Restore uploaded videos stored in IndexedDB.
        await restoreUploadedVideos();

        // Start playback for the video in view.
        requestAnimationFrame(() => {
            refreshPlayback();
        });

        console.info("V-Tik initialized successfully.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeVtik, {
            once: true
        });
    } else {
        initializeVtik();
    }
})();
