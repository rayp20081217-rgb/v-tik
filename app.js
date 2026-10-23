"use strict";

/* ============================================================
   V-TIK — COMPLETE VIDEO SHARING APP
   File: app.js

   FEATURES
   - Reliable muted autoplay for the visible video
   - Pause and rewind videos that are no longer active
   - Vertical swipe navigation on mobile
   - Mouse/trackpad scrolling and keyboard navigation
   - Likes, comments, saves, follows and sharing
   - Search videos and creators
   - Video uploads with IndexedDB persistence
   - Upload preview and drag-and-drop
   - Video sound and playback controls
   - Comments and full-screen viewer support

   DEMO VIDEO FILES
   ./vtik-demo-1.mp4
   ./vtik-demo-2.mp4
   ./vtik-demo-3.mp4
============================================================ */

(() => {
    "use strict";

    /* ========================================================
       1. HELPERS
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

    const KEYS = {
        likes: "vtik_likes",
        saves: "vtik_saves",
        follows: "vtik_follows",
        comments: "vtik_comments",
        muted: "vtik_muted",
        tab: "vtik_active_tab"
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
            shares: 23
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
            shares: 17
        },
        {
            id: "demo-3",
            src: "./vtik-demo-3.mp4",
            username: "trending_videos",
            displayName: "Trending Videos",
            caption: "Discover something new today.",
            music: "Original sound",
            likes: 2360,
            comments: 120,
            shares: 65
        }
    ];

    let videos = [];
    let activeVideo = null;
    let activeVideoId = null;
    let activeCommentVideoId = null;

    let observer = null;
    let dbPromise = null;
    let previewObjectUrl = null;

    let muted = readStorage(KEYS.muted, true);
    let currentSearch = "";
    let currentTab = readStorage(KEYS.tab, "home");
    let isUploading = false;
    let isNavigating = false;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let lastTapTime = 0;
    let lastTapId = null;

    let playbackTimer = null;
    let navigationTimer = null;

    const likes = new Set(readStorage(KEYS.likes, []));
    const saves = new Set(readStorage(KEYS.saves, []));
    const follows = new Set(readStorage(KEYS.follows, []));
    const comments = readStorage(KEYS.comments, {});

    /* ========================================================
       2. GENERAL UTILITIES
    ======================================================== */

    function readStorage(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch (error) {
            console.warn("V-Tik: Storage read failed:", key, error);
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn("V-Tik: Storage write failed:", key, error);
        }
    }

    function saveState() {
        writeStorage(KEYS.likes, [...likes]);
        writeStorage(KEYS.saves, [...saves]);
        writeStorage(KEYS.follows, [...follows]);
        writeStorage(KEYS.comments, comments);
        writeStorage(KEYS.muted, muted);
        writeStorage(KEYS.tab, currentTab);
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

    function makeId() {
        return window.crypto?.randomUUID
            ? `user-${crypto.randomUUID()}`
            : `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function formatCount(value) {
        const number = Number(value) || 0;

        if (number >= 1_000_000) {
            return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
        }

        if (number >= 1_000) {
            return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
        }

        return String(number);
    }

    function getVideo(id) {
        return videos.find((video) => video.id === id);
    }

    function getCard(id) {
        return $$(".video-card", feed).find(
            (card) => card.dataset.videoId === id
        ) || null;
    }

    function getCardVideo(card) {
        return $("video.feed-video, video", card);
    }

    function getVideoLikes(video) {
        return (Number(video.likes) || 0) + (likes.has(video.id) ? 1 : 0);
    }

    function getVideoComments(video) {
        return Array.isArray(comments[video.id])
            ? comments[video.id]
            : [];
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

        clearTimeout(notice._timer);

        notice._timer = setTimeout(() => {
            notice.classList.remove("show");
        }, 2500);
    }

    function isTypingTarget(target) {
        return Boolean(target.closest(
            "input, textarea, select, [contenteditable='true']"
        ));
    }

    function isModalOpen() {
        return [createModal, commentsModal, videoViewer].some(
            (modal) => modal?.classList.contains("active")
        );
    }

    /* ========================================================
       3. INDEXEDDB STORAGE FOR UPLOADED VIDEOS
    ======================================================== */

    function openDatabase() {
        if (!("indexedDB" in window)) {
            return Promise.reject(
                new Error("IndexedDB is unavailable in this browser.")
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

            request.onerror = () => {
                dbPromise = null;
                reject(request.error);
            };
        });

        return dbPromise;
    }

    async function saveUploadedVideo(record) {
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction(
                STORE_NAME,
                "readwrite"
            );

            transaction.objectStore(STORE_NAME).put(record);

            transaction.oncomplete = () => resolve();
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

    async function removeUploadedVideo(id) {
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction(
                STORE_NAME,
                "readwrite"
            );

            transaction.objectStore(STORE_NAME).delete(id);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function restoreUploadedVideos() {
        try {
            const records = await getUploadedVideos();

            records.forEach((record) => {
                if (videos.some((video) => video.id === record.id)) return;
                if (!record.blob) return;

                videos.push({
                    id: record.id,
                    src: URL.createObjectURL(record.blob),
                    username: record.username || "you",
                    displayName: record.displayName || "Your video",
                    caption: record.caption || "",
                    music: record.music || "Original sound",
                    likes: 0,
                    comments: 0,
                    shares: 0,
                    uploaded: true,
                    blob: record.blob
                });
            });

            renderFeed();
        } catch (error) {
            console.error("V-Tik: Could not restore uploaded videos.", error);
        }
    }

    /* ========================================================
       4. VIDEO CARD TEMPLATE
    ======================================================== */

    function createVideoCard(video) {
        const liked = likes.has(video.id);
        const saved = saves.has(video.id);
        const following = follows.has(video.username);

        const card = document.createElement("article");
        card.className = "video-card";
        card.dataset.videoId = video.id;
        card.dataset.username = video.username;

        card.innerHTML = `
            <div class="video-stage">
                <video
                    class="feed-video"
                    src="${escapeHTML(video.src)}"
                    playsinline
                    webkit-playsinline
                    muted
                    loop
                    preload="auto"
                    aria-label="${escapeHTML(video.caption || "V-Tik video")}"
                ></video>

                <button
                    class="video-play-overlay"
                    type="button"
                    data-action="toggle-play"
                    aria-label="Play video"
                >
                    <span>▶</span>
                </button>

                <div class="video-top-bar">
                    <span class="video-brand">V-TIK</span>
                    <button
                        class="sound-toggle"
                        type="button"
                        data-action="sound"
                        aria-label="Turn sound on"
                    >🔇</button>
                </div>

                <div class="video-bottom-gradient"></div>

                <div class="video-info">
                    <div class="video-creator">
                        <div class="creator-avatar">
                            ${escapeHTML(
                                (video.displayName || video.username)
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
                                    >${following ? "Following" : "Follow"}</button>
                                `
                                : ""
                        }
                    </div>

                    <p class="video-caption">
                        ${escapeHTML(video.caption || "Enjoy this video!")}
                    </p>

                    <div class="video-music">
                        <span>♫</span>
                        <span>${escapeHTML(video.music || "Original sound")}</span>
                    </div>
                </div>

                <div class="video-actions">
                    <button
                        class="action-btn like-btn ${liked ? "active" : ""}"
                        type="button"
                        data-action="like"
                        aria-pressed="${liked}"
                        aria-label="Like video"
                    >
                        <span class="action-icon">${liked ? "♥" : "♡"}</span>
                        <span class="action-count">${formatCount(getVideoLikes(video))}</span>
                    </button>

                    <button class="action-btn" type="button" data-action="comment" aria-label="Comments">
                        <span class="action-icon">💬</span>
                        <span class="action-count">${formatCount(getVideoComments(video).length || video.comments || 0)}</span>
                    </button>

                    <button
                        class="action-btn save-btn ${saved ? "active" : ""}"
                        type="button"
                        data-action="save"
                        aria-pressed="${saved}"
                        aria-label="Save video"
                    >
                        <span class="action-icon">${saved ? "🔖" : "♧"}</span>
                        <span class="action-count">${saved ? "Saved" : "Save"}</span>
                    </button>

                    <button class="action-btn" type="button" data-action="share" aria-label="Share video">
                        <span class="action-icon">↗</span>
                        <span class="action-count">Share</span>
                    </button>

                    <button class="action-btn" type="button" data-action="expand" aria-label="View video">
                        <span class="action-icon">⛶</span>
                        <span class="action-count">View</span>
                    </button>
                </div>
            </div>
        `;

        const videoElement = getCardVideo(card);

        if (videoElement) {
            configureVideo(videoElement);
        }

        return card;
    }

    function configureVideo(video) {
        // Muted autoplay is the most compatible browser default.
        video.muted = true;
        video.defaultMuted = true;
        video.autoplay = false;
        video.loop = true;
        video.playsInline = true;

        video.setAttribute("muted", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("preload", "auto");
    }

    /* ========================================================
       5. FEED RENDERING AND FILTERING
    ======================================================== */

    function getVisibleVideos() {
        let result = [...videos];

        if (currentTab === "following") {
            result = result.filter((video) => follows.has(video.username));
        } else if (currentTab === "saved") {
            result = result.filter((video) => saves.has(video.id));
        }

        const query = currentSearch.trim().toLowerCase();

        if (query) {
            result = result.filter((video) => {
                const content = [
                    video.caption,
                    video.username,
                    video.displayName,
                    video.music
                ].join(" ").toLowerCase();

                return content.includes(query);
            });
        }

        return result;
    }

    function renderFeed() {
        if (!feed) return;

        stopAllVideos();
        activeVideo = null;
        activeVideoId = null;

        if (observer) {
            observer.disconnect();
            observer = null;
        }

        const visibleVideos = getVisibleVideos();

        feed.innerHTML = "";

        if (!visibleVideos.length) {
            const empty = document.createElement("div");
            empty.className = "feed-empty";

            empty.innerHTML = `
                <div class="feed-empty-icon">🎬</div>
                <h3>No videos found</h3>
                <p>${currentSearch ? "Try another search." : "Upload a video or select another section."}</p>
                <button type="button" data-action="open-create">Upload a video</button>
            `;

            feed.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();

        visibleVideos.forEach((video) => {
            fragment.appendChild(createVideoCard(video));
        });

        feed.appendChild(fragment);

        observeVideos();

        requestAnimationFrame(() => {
            refreshPlayback();
        });
    }

    /* ========================================================
       6. AUTOPLAY — CORE FIX
    ======================================================== */

    function stopVideo(video, rewind = true) {
        if (!video) return;

        video.pause();

        if (rewind) {
            try {
                video.currentTime = 0;
            } catch (_) {
                // Metadata may not have loaded.
            }
        }

        const card = video.closest(".video-card");

        if (card) {
            card.classList.remove("is-playing");
            card.classList.add("is-paused");
            updatePlayButton(card, video);
        }
    }

    function stopAllVideos(except = null) {
        $$(".feed-video", feed).forEach((video) => {
            if (video !== except) {
                stopVideo(video, true);
            }
        });
    }

    function updatePlayButton(card, video) {
        const button = $(".video-play-overlay", card);
        if (!button) return;

        const paused = video.paused;
        const icon = $("span", button);

        if (icon) {
            icon.textContent = paused ? "▶" : "Ⅱ";
        }

        button.classList.toggle("visible", paused);
        button.setAttribute(
            "aria-label",
            paused ? "Play video" : "Pause video"
        );
    }

    async function playViewedVideo(video) {
        if (!video || !feed || document.hidden || isModalOpen()) return;

        const card = video.closest(".video-card");
        if (!card || !feed.contains(card)) return;

        // Never autoplay a video that is no longer the best visible card.
        const rect = card.getBoundingClientRect();

        if (
            rect.bottom <= 0 ||
            rect.top >= window.innerHeight
        ) {
            return;
        }

        // Pause and rewind every other feed video.
        $$(".feed-video", feed).forEach((other) => {
            if (other !== video) stopVideo(other, true);
        });

        activeVideo = video;
        activeVideoId = card.dataset.videoId;

        configureVideo(video);

        // Honor the browser's autoplay policy by starting muted.
        video.muted = true;
        video.defaultMuted = true;

        try {
            const result = video.play();

            // Handle browsers that return a promise from play().
            if (result && typeof result.then === "function") {
                await result;
            }

            // Do not mark a replaced or removed video as active.
            if (activeVideo !== video) {
                stopVideo(video, true);
                return;
            }

            card.classList.add("is-playing");
            card.classList.remove("is-paused");
        } catch (error) {
            card.classList.remove("is-playing");
            card.classList.add("is-paused");

            console.warn(
                "V-Tik could not autoplay this video:",
                error.name,
                error.message,
                video.currentSrc || video.src
            );
        }

        updatePlayButton(card, video);
    }

    function observeVideos() {
        if (!feed) return;

        if (observer) {
            observer.disconnect();
            observer = null;
        }

        const cards = $$(".video-card", feed);

        cards.forEach((card) => {
            const video = getCardVideo(card);
            if (!video) return;

            configureVideo(video);

            // Loading metadata helps identify invalid video paths early.
            video.addEventListener("error", () => {
                console.error(
                    "V-Tik video failed to load:",
                    video.currentSrc || video.src,
                    video.error
                );
            }, { once: true });
        });

        if ("IntersectionObserver" in window) {
            observer = new IntersectionObserver(() => {
                refreshPlayback();
            }, {
                root: null,
                threshold: [0, 0.25, 0.5, 0.6, 0.75, 1]
            });

            cards.forEach((card) => observer.observe(card));
        }

        // Do not wait for the observer's first callback.
        requestAnimationFrame(refreshPlayback);
    }

    function refreshPlayback() {
        if (!feed || document.hidden || isModalOpen()) return;

        const cards = $$(".video-card", feed);

        if (!cards.length) {
            stopAllVideos();
            activeVideo = null;
            activeVideoId = null;
            return;
        }

        let bestCard = null;
        let bestRatio = 0;

        cards.forEach((card) => {
            const rect = card.getBoundingClientRect();

            const visibleHeight = Math.max(
                0,
                Math.min(rect.bottom, window.innerHeight) -
                Math.max(rect.top, 0)
            );

            const visibleWidth = Math.max(
                0,
                Math.min(rect.right, window.innerWidth) -
                Math.max(rect.left, 0)
            );

            const visibleArea = visibleHeight * visibleWidth;
            const totalArea = Math.max(1, rect.width * rect.height);
            const ratio = visibleArea / totalArea;

            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestCard = card;
            }
        });

        // Activate the card with the largest visible area.
        if (bestCard && bestRatio >= 0.50) {
            const video = getCardVideo(bestCard);

            if (video && video !== activeVideo) {
                playViewedVideo(video);
            } else if (video && video.paused) {
                playViewedVideo(video);
            }
        } else {
            stopAllVideos();
            activeVideo = null;
            activeVideoId = null;
        }
    }

    /* ========================================================
       7. PLAY / PAUSE AND SOUND
    ======================================================== */

    async function togglePlayback(video) {
        if (!video) return;

        if (video.paused) {
            // User interaction permits an attempt to play immediately.
            video.muted = true;
            await playViewedVideo(video);
        } else {
            video.pause();

            const card = video.closest(".video-card");

            if (card) {
                card.classList.remove("is-playing");
                card.classList.add("is-paused");
                updatePlayButton(card, video);
            }
        }
    }

    function toggleSound(video) {
        if (!video) return;

        // Muting is always available; enabling audio follows a user gesture.
        muted = !muted;
        writeStorage(KEYS.muted, muted);

        $$(".feed-video", feed).forEach((item) => {
            item.muted = muted;
        });

        const viewerVideo = videoViewer && $("video", videoViewer);

        if (viewerVideo) {
            viewerVideo.muted = muted;
        }

        $$(".sound-toggle").forEach((button) => {
            button.textContent = muted ? "🔇" : "🔊";
            button.setAttribute(
                "aria-label",
                muted ? "Turn sound on" : "Mute video"
            );
        });

        if (!muted && video.paused) {
            togglePlayback(video);
        }
    }

    /* ========================================================
       8. VERTICAL SWIPE NAVIGATION
    ======================================================== */

    function navigateFeed(direction) {
        if (!feed || isNavigating || isModalOpen()) return;

        const cards = $$(".video-card", feed);
        if (!cards.length) return;

        let index = cards.findIndex(
            (card) => card.dataset.videoId === activeVideoId
        );

        if (index < 0) {
            index = cards.findIndex((card) => {
                const rect = card.getBoundingClientRect();

                return rect.top < window.innerHeight &&
                    rect.bottom > 0;
            });
        }

        if (index < 0) index = 0;

        const nextIndex = Math.max(
            0,
            Math.min(cards.length - 1, index + direction)
        );

        if (nextIndex === index) return;

        isNavigating = true;

        const nextCard = cards[nextIndex];

        stopAllVideos();

        nextCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        const nextVideo = getCardVideo(nextCard);

        if (nextVideo) {
            // Play immediately; visibility checks prevent offscreen playback.
            playViewedVideo(nextVideo);
        }

        clearTimeout(navigationTimer);

        navigationTimer = setTimeout(() => {
            isNavigating = false;
            refreshPlayback();
        }, 500);
    }

    function bindSwipeNavigation() {
        if (!feed) return;

        feed.addEventListener("touchstart", (event) => {
            if (!event.touches.length) return;

            if (event.target.closest(
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

            const deltaX = event.changedTouches[0].clientX - touchStartX;
            const deltaY = event.changedTouches[0].clientY - touchStartY;
            const duration = Date.now() - touchStartTime;

            touchStartY = 0;

            if (Math.abs(deltaY) < 60) return;
            if (Math.abs(deltaX) > Math.abs(deltaY) * 0.8) return;
            if (duration > 1000) return;

            navigateFeed(deltaY < 0 ? 1 : -1);
        }, { passive: true });

        // Arrow keys navigate between cards on desktop.
        document.addEventListener("keydown", (event) => {
            if (isTypingTarget(event.target) || isModalOpen()) return;

            if (event.key === "ArrowDown" || event.key === "PageDown") {
                event.preventDefault();
                navigateFeed(1);
            }

            if (event.key === "ArrowUp" || event.key === "PageUp") {
                event.preventDefault();
                navigateFeed(-1);
            }

            if (event.code === "Space" && activeVideo && feed.contains(activeVideo)) {
                event.preventDefault();
                togglePlayback(activeVideo);
            }
        });
    }

    /* ========================================================
       9. LIKE, SAVE AND FOLLOW
    ======================================================== */

    function updateCardActions(id) {
        const video = getVideo(id);
        const card = getCard(id);

        if (!video || !card) return;

        const likeButton = $('[data-action="like"]', card);
        const saveButton = $('[data-action="save"]', card);
        const commentButton = $('[data-action="comment"]', card);

        if (likeButton) {
            const liked = likes.has(id);

            likeButton.classList.toggle("active", liked);
            likeButton.setAttribute("aria-pressed", String(liked));

            $(".action-icon", likeButton).textContent = liked ? "♥" : "♡";
            $(".action-count", likeButton).textContent =
                formatCount(getVideoLikes(video));
        }

        if (saveButton) {
            const saved = saves.has(id);

            saveButton.classList.toggle("active", saved);
            saveButton.setAttribute("aria-pressed", String(saved));

            $(".action-icon", saveButton).textContent = saved ? "🔖" : "♧";
            $(".action-count", saveButton).textContent = saved ? "Saved" : "Save";
        }

        if (commentButton) {
            $(".action-count", commentButton).textContent =
                formatCount(getVideoComments(video).length || video.comments || 0);
        }
    }

    function toggleLike(id) {
        if (!getVideo(id)) return;

        if (likes.has(id)) {
            likes.delete(id);
        } else {
            likes.add(id);
        }

        saveState();
        updateCardActions(id);
    }

    function toggleSave(id) {
        if (!getVideo(id)) return;

        if (saves.has(id)) {
            saves.delete(id);
            showNotice("Removed from saved videos.");
        } else {
            saves.add(id);
            showNotice("Video saved!");
        }

        saveState();

        if (currentTab === "saved") {
            renderFeed();
        } else {
            updateCardActions(id);
        }
    }

    function toggleFollow(username) {
        if (!username) return;

        if (follows.has(username)) {
            follows.delete(username);
            showNotice(`Unfollowed @${username}`);
        } else {
            follows.add(username);
            showNotice(`Following @${username}`);
        }

        saveState();

        if (currentTab === "following") {
            renderFeed();
            return;
        }

        $$(".video-card", feed).forEach((card) => {
            if (card.dataset.username !== username) return;

            const button = $('[data-action="follow"]', card);
            if (!button) return;

            const following = follows.has(username);

            button.textContent = following ? "Following" : "Follow";
            button.classList.toggle("active", following);
            button.setAttribute("aria-pressed", String(following));
        });
    }

    /* ========================================================
       10. COMMENTS
    ======================================================== */

    function openComments(id) {
        const video = getVideo(id);

        if (!video || !commentsModal) {
            showNotice("Comments are unavailable.");
            return;
        }

        activeCommentVideoId = id;

        const title = $(
            "[data-comments-title], .comments-title",
            commentsModal
        );

        if (title) {
            title.textContent = `Comments · @${video.username}`;
        }

        renderComments(id);
        openModal(commentsModal);
    }

    function renderComments(id) {
        if (!commentsModal) return;

        if (!Array.isArray(comments[id])) {
            comments[id] = [];
        }

        const list = $(
            "#commentsList, [data-comments-list], .comments-list",
            commentsModal
        );

        if (!list) return;

        const items = comments[id];

        if (!items.length) {
            list.innerHTML = `
                <div class="comments-empty">
                    <p>No comments yet.</p>
                    <span>Be the first to comment!</span>
                </div>
            `;
        } else {
            list.innerHTML = items.map((comment) => `
                <div class="comment-item">
                    <div class="comment-avatar">
                        ${escapeHTML((comment.username || "you").charAt(0).toUpperCase())}
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

    function addComment(text) {
        if (!activeCommentVideoId || !text.trim()) return;

        const id = activeCommentVideoId;

        if (!Array.isArray(comments[id])) {
            comments[id] = [];
        }

        comments[id].push({
            id: makeId(),
            username: "you",
            text: text.trim(),
            time: new Date().toLocaleString()
        });

        saveState();
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

        const url = new URL(window.location.href);
        url.hash = `video-${encodeURIComponent(id)}`;

        const data = {
            title: "V-Tik video",
            text: video.caption || `Watch @${video.username} on V-Tik`,
            url: url.href
        };

        try {
            if (navigator.share) {
                await navigator.share(data);
            } else if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(data.url);
                showNotice("Video link copied!");
            } else {
                window.prompt("Copy this video link:", data.url);
            }

            video.shares = (Number(video.shares) || 0) + 1;
        } catch (error) {
            if (error.name !== "AbortError") {
                window.prompt("Copy this video link:", data.url);
            }
        }
    }

    /* ========================================================
       12. VIDEO VIEWER
    ======================================================== */

    function openViewer(id) {
        const video = getVideo(id);

        if (!video || !videoViewer) {
            showNotice("Video viewer was not found.");
            return;
        }

        const viewerVideo = $("video", videoViewer);

        if (viewerVideo) {
            viewerVideo.src = video.src;
            viewerVideo.muted = muted;
            viewerVideo.loop = true;
            viewerVideo.playsInline = true;

            viewerVideo.play().catch((error) => {
                console.warn("Viewer playback was blocked:", error);
            });
        }

        const caption = $("[data-viewer-caption]", videoViewer);
        const username = $("[data-viewer-username]", videoViewer);

        if (caption) caption.textContent = video.caption || "";
        if (username) username.textContent = `@${video.username}`;

        stopAllVideos();
        openModal(videoViewer);
    }

    function closeViewer() {
        if (!videoViewer) return;

        const viewerVideo = $("video", videoViewer);

        if (viewerVideo) {
            viewerVideo.pause();
            viewerVideo.removeAttribute("src");
            viewerVideo.load();
        }

        closeModal(videoViewer);

        activeVideo = null;
        activeVideoId = null;

        requestAnimationFrame(refreshPlayback);
    }

    /* ========================================================
       13. MODALS
    ======================================================== */

    function openModal(modal) {
        if (!modal) return;

        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");

        stopAllVideos();
    }

    function closeModal(modal) {
        if (!modal) return;

        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");

        const stillOpen = [createModal, commentsModal, videoViewer].some(
            (item) => item?.classList.contains("active")
        );

        if (!stillOpen) {
            document.body.classList.remove("modal-open");
            requestAnimationFrame(refreshPlayback);
        }
    }

    function openCreateModal() {
        if (!createModal) {
            showNotice("Upload modal was not found in the HTML.");
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
            showNotice("Video exceeds the 250 MB upload limit.");
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
        if (isUploading) return;

        const file = videoPicker?.files?.[0];

        if (!file) {
            showNotice("Choose a video before uploading.");
            return;
        }

        if (!file.type.startsWith("video/")) {
            showNotice("Please choose a valid video file.");
            return;
        }

        isUploading = true;

        if (postVideo) {
            postVideo.disabled = true;
            postVideo.textContent = "Uploading...";
        }

        const id = makeId();
        const caption = videoCaption?.value?.trim() || "";

        try {
            await saveUploadedVideo({
                id,
                blob: file,
                username: "you",
                displayName: "Your video",
                caption,
                music: "Original sound",
                createdAt: Date.now()
            });

            videos.unshift({
                id,
                src: URL.createObjectURL(file),
                username: "you",
                displayName: "Your video",
                caption,
                music: "Original sound",
                likes: 0,
                comments: 0,
                shares: 0,
                uploaded: true,
                blob: file
            });

            currentTab = "home";
            currentSearch = "";

            if (searchInput) searchInput.value = "";

            saveState();
            closeModal(createModal);
            resetUploadForm();
            renderFeed();

            const card = getCard(id);

            if (card) {
                card.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                const video = getCardVideo(card);

                if (video) {
                    setTimeout(() => playViewedVideo(video), 100);
                }
            }

            showNotice("Video uploaded successfully!");
        } catch (error) {
            console.error("V-Tik upload failed:", error);
            showNotice("Upload failed. Check browser storage and try again.");
        } finally {
            isUploading = false;

            if (postVideo) {
                postVideo.disabled = false;
                postVideo.textContent = "Post video";
            }
        }
    }

    /* ========================================================
       15. SEARCH AND NAVIGATION
    ======================================================== */

    function bindSearch() {
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                currentSearch = searchInput.value.trim();
                renderFeed();
            });
        }

        if (clearSearch) {
            clearSearch.addEventListener("click", () => {
                if (searchInput) {
                    searchInput.value = "";
                    searchInput.focus();
                }

                currentSearch = "";
                renderFeed();
            });
        }
    }

    function setActiveTab(tab) {
        if (!["home", "following", "saved"].includes(tab)) {
            tab = "home";
        }

        currentTab = tab;
        saveState();

        $$("[data-section]").forEach((element) => {
            const selected = element.dataset.section === tab;

            element.classList.toggle("active", selected);

            if (element.matches("a, button")) {
                if (selected) {
                    element.setAttribute("aria-current", "page");
                } else {
                    element.removeAttribute("aria-current");
                }
            }
        });

        renderFeed();
    }

    function bindNavigation() {
        document.addEventListener("click", (event) => {
            const item = event.target.closest("[data-section]");
            if (!item) return;

            event.preventDefault();
            setActiveTab(item.dataset.section);
        });
    }

    /* ========================================================
       16. FEED ACTION EVENTS
    ======================================================== */

    function bindFeedActions() {
        if (!feed) return;

        feed.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action]");

            if (button) {
                const action = button.dataset.action;

                if (action === "open-create") {
                    openCreateModal();
                    return;
                }

                const card = button.closest(".video-card");
                const id = card?.dataset.videoId;
                const video = getVideo(id);

                if (!id) return;

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
                        if (video) toggleFollow(video.username);
                        break;

                    case "share":
                        shareVideo(id);
                        break;

                    case "expand":
                        openViewer(id);
                        break;

                    case "sound":
                        toggleSound(getCardVideo(card));
                        break;

                    case "toggle-play":
                        togglePlayback(getCardVideo(card));
                        break;
                }

                return;
            }

            const card = event.target.closest(".video-card");
            if (!card) return;

            const video = getCardVideo(card);
            if (!video) return;

            // Double-click or double-tap to like a video.
            const id = card.dataset.videoId;
            const now = Date.now();

            if (lastTapId === id && now - lastTapTime < 350) {
                if (!likes.has(id)) toggleLike(id);
                showLikeAnimation(card);
                lastTapId = null;
                lastTapTime = 0;
            } else {
                lastTapId = id;
                lastTapTime = now;
            }
        });

        feed.addEventListener("play", (event) => {
            if (!event.target.matches("video")) return;

            const card = event.target.closest(".video-card");

            if (card) {
                card.classList.add("is-playing");
                card.classList.remove("is-paused");
                updatePlayButton(card, event.target);
            }
        }, true);

        feed.addEventListener("pause", (event) => {
            if (!event.target.matches("video")) return;

            const card = event.target.closest(".video-card");

            if (card) {
                card.classList.remove("is-playing");
                card.classList.add("is-paused");
                updatePlayButton(card, event.target);
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
       17. MODAL, COMMENT AND UPLOAD EVENTS
    ======================================================== */

    function bindModalActions() {
        document.addEventListener("click", (event) => {
            const createButton = event.target.closest(
                "#openCreate, #createButton, [data-action='open-create']"
            );

            if (createButton) {
                event.preventDefault();
                openCreateModal();
                return;
            }

            const closeButton = event.target.closest(
                "[data-close-modal], .modal-close, .viewer-close"
            );

            if (closeButton) {
                const modal = closeButton.closest(
                    ".modal, .viewer, [role='dialog']"
                );

                if (modal === videoViewer) {
                    closeViewer();
                } else if (modal) {
                    closeModal(modal);
                }

                return;
            }

            if (event.target === createModal) closeModal(createModal);
            if (event.target === commentsModal) closeModal(commentsModal);
            if (event.target === videoViewer) closeViewer();
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
                if (event.target !== videoPicker) {
                    videoPicker?.click();
                }
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
                        // Preview still works if assigning files is unsupported.
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

        document.addEventListener("click", (event) => {
            const button = event.target.closest(
                "#submitComment, [data-submit-comment]"
            );

            if (!button) return;

            const input = $(
                "#commentInput, [name='comment'], [data-comment-input]",
                commentsModal
            );

            if (input) addComment(input.value);
        });
    }

    /* ========================================================
       18. PAGE LIFECYCLE
    ======================================================== */

    function bindPageLifecycle() {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                stopAllVideos();
                activeVideo = null;
                activeVideoId = null;
            } else {
                refreshPlayback();
            }
        });

        window.addEventListener("resize", () => {
            refreshPlayback();
        });

        window.addEventListener("orientationchange", () => {
            setTimeout(refreshPlayback, 250);
        });

        // Native scrolling updates autoplay as the feed moves.
        window.addEventListener("scroll", () => {
            clearTimeout(playbackTimer);

            playbackTimer = setTimeout(() => {
                refreshPlayback();
            }, 80);
        }, { passive: true });

        if (feed) {
            feed.addEventListener("scroll", () => {
                clearTimeout(playbackTimer);

                playbackTimer = setTimeout(() => {
                    refreshPlayback();
                }, 80);
            }, { passive: true });
        }
    }

    /* ========================================================
       19. DELETE UPLOADED VIDEOS
    ======================================================== */

    async function deleteVideo(id) {
        const video = getVideo(id);

        if (!video || !video.uploaded) {
            showNotice("Only uploaded videos can be deleted.");
            return;
        }

        if (!window.confirm("Delete this uploaded video?")) return;

        try {
            await removeUploadedVideo(id);

            if (activeVideoId === id) {
                stopAllVideos();
                activeVideo = null;
                activeVideoId = null;
            }

            if (video.src?.startsWith("blob:")) {
                URL.revokeObjectURL(video.src);
            }

            videos = videos.filter((item) => item.id !== id);

            likes.delete(id);
            saves.delete(id);
            delete comments[id];

            saveState();
            renderFeed();

            showNotice("Video deleted.");
        } catch (error) {
            console.error("V-Tik: Video deletion failed.", error);
            showNotice("Could not delete this video.");
        }
    }

    /* ========================================================
       20. PUBLIC API
    ======================================================== */

    window.VTik = {
        get videos() {
            return [...videos];
        },
        playVideo(id) {
            const card = getCard(id);
            const video = card && getCardVideo(card);

            if (video) playViewedVideo(video);
        },
        refreshPlayback,
        likeVideo: toggleLike,
        saveVideo: toggleSave,
        followUser: toggleFollow,
        openComments,
        openViewer,
        closeViewer,
        openCreateModal,
        setActiveTab,
        deleteVideo
    };

    /* ========================================================
       21. INITIALIZE APPLICATION
    ======================================================== */

    async function initializeVtik() {
        if (!feed) {
            console.error(
                'V-Tik: Missing #feed. Add an element with id="feed" to index.html.'
            );
            return;
        }

        videos = DEMO_VIDEOS.map((video) => ({ ...video }));

        bindSearch();
        bindNavigation();
        bindFeedActions();
        bindSwipeNavigation();
        bindModalActions();
        bindPageLifecycle();

        renderFeed();

        await restoreUploadedVideos();

        // Attempt autoplay once the browser has had a frame to lay out cards.
        requestAnimationFrame(() => {
            requestAnimationFrame(refreshPlayback);
        });

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
in this file, add autoplay function/* ==================================================
   V-TIK APP.JS
   Autoplay, video feed, likes, comments, saves,
   follows, search, and uploads.
================================================== */

(() => {
    "use strict";

    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const byId = id => document.getElementById(id);

    // Supports either feed ID.
    let feed = byId("feed") || byId("videoList");

    const createModal = byId("createModal");
    const commentsModal = byId("commentsModal");
    const videoPicker = byId("videoPicker");
    const captionInput = byId("videoCaption");
    const postButton = byId("postVideo");
    const searchInput = byId("searchInput");

    const read = (key, fallback) => {
        try {
            const value = localStorage.getItem("vtik_" + key);
            return value === null ? fallback : JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    const write = (key, value) => {
        try {
            localStorage.setItem("vtik_" + key, JSON.stringify(value));
        } catch (error) {
            console.warn("Could not save V-Tik data:", error);
        }
    };

    const likes = new Set(read("likes", []));
    const saves = new Set(read("saves", []));
    const follows = new Set(read("follows", []));
    const comments = read("comments", {});

    let activeTab = read("active_tab", "home");
    let searchTerm = "";
    let activeVideo = null;
    let observer = null;
    let touchStartY = 0;
    let previewUrl = null;

    const videos = [
        {
            id: "demo-1",
            src: "./vtik-demo-1.mp4",
            username: "vtik_creator",
            caption: "Welcome to V-Tik! Discover amazing videos.",
            likes: 1250
        },
        {
            id: "demo-2",
            src: "./vtik-demo-2.mp4",
            username: "daily_moments",
            caption: "Enjoy the little moments in life.",
            likes: 842
        },
        {
            id: "demo-3",
            src: "./vtik-demo-3.mp4",
            username: "trending_videos",
            caption: "Discover something new today.",
            likes: 2360
        }
    ];

    function id() {
        return crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()) + Math.random().toString(36).slice(2);
    }

    function escapeHTML(value = "") {
        return String(value).replace(/[&<>"']/g, ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[ch]);
    }

    function notice(message) {
        let box = byId("vtikNotice");

        if (!box) {
            box = document.createElement("div");
            box.id = "vtikNotice";
            Object.assign(box.style, {
                position: "fixed",
                bottom: "25px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: "99999",
                background: "#222",
                color: "#fff",
                padding: "12px 18px",
                borderRadius: "12px"
            });
            document.body.appendChild(box);
        }

        box.textContent = message;
        box.hidden = false;
        clearTimeout(box.timer);
        box.timer = setTimeout(() => {
            box.hidden = true;
        }, 2300);
    }

    function findVideo(videoId) {
        return videos.find(v => v.id === videoId);
    }

    function findCard(videoId) {
        return $$(".video-card", feed).find(
            card => card.dataset.videoId === videoId
        );
    }

    function cardVideo(card) {
        return $("video", card);
    }

    function modalOpen() {
        return [createModal, commentsModal, byId("videoViewer")]
            .some(modal => modal?.classList.contains("active"));
    }

    /* ================================================
       AUTOPLAY
    ================================================ */

    function configureVideo(video) {
        video.muted = true;
        video.defaultMuted = true;
        video.autoplay = true;
        video.loop = true;
        video.playsInline = true;

        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        video.setAttribute("loop", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("preload", "auto");
    }

    function pauseOtherVideos(except = null) {
        if (!feed) return;

        $$("video", feed).forEach(video => {
            if (video !== except) {
                video.pause();
                video.closest(".video-card")
                    ?.classList.remove("is-playing");
            }
        });
    }

    async function playVisibleVideo(video) {
        if (!video || document.hidden || modalOpen()) return;

        const card = video.closest(".video-card");
        if (!card || !feed?.contains(card)) return;

        const rect = card.getBoundingClientRect();
        const visibleHeight = Math.max(
            0,
            Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)
        );
        const visibleWidth = Math.max(
            0,
            Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)
        );

        if (visibleHeight === 0 || visibleWidth === 0) return;

        pauseOtherVideos(video);
        activeVideo = video;
        configureVideo(video);

        // Muted playback is allowed by most modern browsers.
        try {
            await video.play();

            if (activeVideo !== video) {
                video.pause();
                return;
            }

            card.classList.add("is-playing");
            card.classList.remove("is-paused");
        } catch (error) {
            card.classList.remove("is-playing");
            card.classList.add("is-paused");

            console.warn(
                "Autoplay failed. Check the video URL or tap play.",
                error
            );
        }

        updatePlayButton(card, video);
    }

    function updatePlayButton(card, video) {
        const button = $("[data-action='play']", card);
        if (!button) return;

        button.textContent = video.paused ? "▶" : "Ⅱ";
        button.setAttribute(
            "aria-label",
            video.paused ? "Play video" : "Pause video"
        );
    }

    function refreshAutoplay() {
        if (!feed) return;

        if (document.hidden || modalOpen()) {
            pauseOtherVideos();
            activeVideo = null;
            return;
        }

        let bestVideo = null;
        let bestVisibility = 0;

        $$(".video-card", feed).forEach(card => {
            const video = cardVideo(card);
            const rect = card.getBoundingClientRect();

            const height = Math.max(
                0,
                Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)
            );
            const width = Math.max(
                0,
                Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)
            );

            const totalArea = Math.max(1, rect.width * rect.height);
            const visibility = (height * width) / totalArea;

            if (visibility > bestVisibility) {
                bestVisibility = visibility;
                bestVideo = video;
            }
        });

        // Play only the video most visible on the screen.
        if (bestVideo && bestVisibility >= 0.35) {
            if (bestVideo !== activeVideo || bestVideo.paused) {
                playVisibleVideo(bestVideo);
            }
        } else {
            pauseOtherVideos();
            activeVideo = null;
        }
    }

    function setupAutoplay() {
        if (observer) observer.disconnect();

        $$(".video-card", feed).forEach(card => {
            const video = cardVideo(card);
            if (!video) return;

            configureVideo(video);

            video.addEventListener("play", () => {
                card.classList.add("is-playing");
                updatePlayButton(card, video);
            });

            video.addEventListener("pause", () => {
                card.classList.remove("is-playing");
                updatePlayButton(card, video);
            });

            video.addEventListener("error", () => {
                console.error(
                    "Video failed to load:",
                    video.currentSrc || video.src
                );
            });
        });

        if ("IntersectionObserver" in window) {
            observer = new IntersectionObserver(
                refreshAutoplay,
                { threshold: [0, 0.25, 0.35, 0.5, 0.75, 1] }
            );

            $$(".video-card", feed).forEach(card => observer.observe(card));
        }

        requestAnimationFrame(refreshAutoplay);
    }

    /* ================================================
       VIDEO FEED
    ================================================ */

    function visibleVideos() {
        let result = [...videos];

        if (activeTab === "following") {
            result = result.filter(v => follows.has(v.username));
        }

        if (activeTab === "saved") {
            result = result.filter(v => saves.has(v.id));
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(v =>
                `${v.username} ${v.caption}`.toLowerCase().includes(term)
            );
        }

        return result;
    }

    function createCard(video) {
        const liked = likes.has(video.id);
        const saved = saves.has(video.id);
        const following = follows.has(video.username);

        const card = document.createElement("article");
        card.className = "video-card";
        card.dataset.videoId = video.id;
        card.dataset.username = video.username;

        card.innerHTML = `
            <div class="video-stage">
                <video class="feed-video"
                    src="${escapeHTML(video.src)}"
                    muted autoplay loop playsinline
                    webkit-playsinline preload="auto"></video>

                <button class="video-play-overlay"
                    data-action="play" aria-label="Play video">▶</button>

                <div class="video-info">
                    <strong>@${escapeHTML(video.username)}</strong>
                    <p>${escapeHTML(video.caption)}</p>

                    <button data-action="follow">
                        ${following ? "Following" : "Follow"}
                    </button>
                </div>

                <div class="video-actions">
                    <button data-action="like">
                        ${liked ? "♥" : "♡"}
                        <span>${video.likes + (liked ? 1 : 0)}</span>
                    </button>

                    <button data-action="comment">💬 Comments</button>

                    <button data-action="save">
                        ${saved ? "🔖 Saved" : "♧ Save"}
                    </button>

                    <button data-action="share">↗ Share</button>

                    <button data-action="sound">🔊 Sound</button>
                </div>
            </div>
        `;

        return card;
    }

    function renderFeed() {
        feed = byId("feed") || byId("videoList");

        if (!feed) {
            console.error(
                'V-Tik: Add an element with id="feed" or id="videoList".'
            );
            return;
        }

        pauseOtherVideos();
        activeVideo = null;

        if (observer) observer.disconnect();

        feed.innerHTML = "";
        const list = visibleVideos();

        if (!list.length) {
            feed.innerHTML = `
                <div class="feed-empty">
                    <h3>No videos found</h3>
                    <p>Try another search or upload a video.</p>
                </div>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        list.forEach(video => fragment.appendChild(createCard(video)));
        feed.appendChild(fragment);

        setupAutoplay();
    }

    /* ================================================
       LIKES, SAVES AND FOLLOWS
    ================================================ */

    function refreshCard(videoId) {
        const video = findVideo(videoId);
        const card = findCard(videoId);
        if (!video || !card) return;

        const likeButton = $("[data-action='like']", card);
        if (likeButton) {
            likeButton.innerHTML =
                `${likes.has(videoId) ? "♥" : "♡"} ` +
                `<span>${video.likes + (likes.has(videoId) ? 1 : 0)}</span>`;
        }

        const saveButton = $("[data-action='save']", card);
        if (saveButton) {
            saveButton.textContent = saves.has(videoId)
                ? "🔖 Saved"
                : "♧ Save";
        }

        const followButton = $("[data-action='follow']", card);
        if (followButton) {
            followButton.textContent = follows.has(video.username)
                ? "Following"
                : "Follow";
        }
    }

    function toggleLike(videoId) {
        likes.has(videoId)
            ? likes.delete(videoId)
            : likes.add(videoId);

        write("likes", [...likes]);
        refreshCard(videoId);
    }

    function toggleSave(videoId) {
        saves.has(videoId)
            ? saves.delete(videoId)
            : saves.add(videoId);

        write("saves", [...saves]);

        if (activeTab === "saved") renderFeed();
        else refreshCard(videoId);
    }

    function toggleFollow(username) {
        follows.has(username)
            ? follows.delete(username)
            : follows.add(username);

        write("follows", [...follows]);

        if (activeTab === "following") renderFeed();
        else {
            $$(".video-card", feed).forEach(card => {
                if (card.dataset.username === username) {
                    refreshCard(card.dataset.videoId);
                }
            });
        }
    }

    /* ================================================
       COMMENTS
    ================================================ */

    function openComments(videoId) {
        if (!commentsModal) {
            notice("Comments panel is missing from your HTML.");
            return;
        }

        comments[videoId] ||= [];
        commentsModal.dataset.videoId = videoId;

        const list = $(
            "#commentsList, .comments-list, [data-comments-list]",
            commentsModal
        );

        if (list) {
            list.innerHTML = comments[videoId].length
                ? comments[videoId].map(comment => `
                    <div class="comment-item">
                        <strong>@${escapeHTML(comment.username)}</strong>
                        <p>${escapeHTML(comment.text)}</p>
                    </div>
                `).join("")
                : "<p>No comments yet.</p>";
        }

        commentsModal.classList.add("active");
        commentsModal.setAttribute("aria-hidden", "false");
        pauseOtherVideos();
    }

    function submitComment() {
        if (!commentsModal) return;

        const videoId = commentsModal.dataset.videoId;
        const input = $(
            "#commentInput, [name='comment'], [data-comment-input]",
            commentsModal
        );

        if (!videoId || !input || !input.value.trim()) return;

        comments[videoId] ||= [];
        comments[videoId].push({
            username: "you",
            text: input.value.trim()
        });

        write("comments", comments);
        input.value = "";
        openComments(videoId);
    }

    /* ================================================
       VIDEO UPLOADS
    ================================================ */

    function openCreateModal() {
        if (!createModal) {
            notice("Upload modal is missing from your HTML.");
            return;
        }

        createModal.classList.add("active");
        createModal.setAttribute("aria-hidden", "false");
        pauseOtherVideos();
    }

    function closeModal(modal) {
        if (!modal) return;

        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");

        if (!modalOpen()) {
            requestAnimationFrame(refreshAutoplay);
        }
    }

    async function uploadVideo() {
        const file = videoPicker?.files?.[0];

        if (!file) {
            notice("Choose a video first.");
            return;
        }

        if (!file.type.startsWith("video/")) {
            notice("Please select a video file.");
            return;
        }

        const videoId = id();
        const src = URL.createObjectURL(file);

        videos.unshift({
            id: videoId,
            src,
            username: "you",
            caption: captionInput?.value.trim() || "",
            likes: 0
        });

        // Persist metadata only. Blob URLs themselves do not survive reloads.
        const savedUploads = read("uploads", []);
        savedUploads.unshift({
            id: videoId,
            caption: captionInput?.value.trim() || "",
            username: "you"
        });
        write("uploads", savedUploads);

        activeTab = "home";
        write("active_tab", activeTab);

        closeModal(createModal);
        renderFeed();

        const card = findCard(videoId);
        if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "start" });
            setTimeout(() => playVisibleVideo(cardVideo(card)), 150);
        }

        if (captionInput) captionInput.value = "";
        if (videoPicker) videoPicker.value = "";

        notice("Video added to your feed!");
    }

    /* ================================================
       SHARING AND SOUND
    ================================================ */

    async function shareVideo(videoId) {
        const video = findVideo(videoId);
        if (!video) return;

        const shareData = {
            title: "V-Tik",
            text: video.caption,
            url: location.href
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else if (navigator.clipboard && isSecureContext) {
                await navigator.clipboard.writeText(shareData.url);
                notice("Link copied!");
            } else {
                prompt("Copy this link:", shareData.url);
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.warn("Sharing was cancelled or unavailable.", error);
            }
        }
    }

    function toggleSound(card) {
        const video = cardVideo(card);
        if (!video) return;

        video.muted = !video.muted;
        video.defaultMuted = video.muted;

        const button = $("[data-action='sound']", card);
        if (button) {
            button.textContent = video.muted ? "🔇 Sound" : "🔊 Sound";
        }

        // Keep all other videos muted/paused.
        if (!video.muted && video.paused) {
            playVisibleVideo(video);
        }
    }

    /* ================================================
       EVENT HANDLERS
    ================================================ */

    function setupEvents() {
        feed.addEventListener("click", event => {
            const button = event.target.closest("[data-action]");
            if (!button) return;

            const card = button.closest(".video-card");
            const videoId = card?.dataset.videoId;
            const video = findVideo(videoId);

            switch (button.dataset.action) {
                case "play": {
                    const media = cardVideo(card);
                    if (media.paused) playVisibleVideo(media);
                    else {
                        media.pause();
                        updatePlayButton(card, media);
                    }
                    break;
                }
                case "like":
                    toggleLike(videoId);
                    break;
                case "save":
                    toggleSave(videoId);
                    break;
                case "follow":
                    if (video) toggleFollow(video.username);
                    break;
                case "comment":
                    openComments(videoId);
                    break;
                case "share":
                    shareVideo(videoId);
                    break;
                case "sound":
                    toggleSound(card);
                    break;
            }
        });

        document.addEventListener("click", event => {
            const createButton = event.target.closest(
                "#openCreate, #createButton, #createTop, [data-action='open-create']"
            );

            if (createButton) {
                event.preventDefault();
                openCreateModal();
            }

            const closeButton = event.target.closest(
                "[data-close-modal], .modal-close, .viewer-close"
            );

            if (closeButton) {
                const modal = closeButton.closest(".modal, .viewer");
                closeModal(modal);
            }

            if (event.target === createModal) closeModal(createModal);
            if (event.target === commentsModal) closeModal(commentsModal);

            if (event.target.closest("#submitComment, [data-submit-comment]")) {
                submitComment();
            }
        });

        if (postButton) {
            postButton.addEventListener("click", event => {
                event.preventDefault();
                uploadVideo();
            });
        }

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                searchTerm = searchInput.value.trim();
                renderFeed();
            });
        }

        $$("[data-section]").forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();

                activeTab = button.dataset.section;
                write("active_tab", activeTab);

                $$("[data-section]").forEach(item => {
                    item.classList.toggle(
                        "active",
                        item.dataset.section === activeTab
                    );
                });

                renderFeed();
            });
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                pauseOtherVideos();
                activeVideo = null;
            } else {
                refreshAutoplay();
            }
        });

        window.addEventListener("scroll", refreshAutoplay, { passive: true });
        window.addEventListener("resize", refreshAutoplay);

        feed.addEventListener("scroll", refreshAutoplay, { passive: true });

        feed.addEventListener("touchstart", event => {
            touchStartY = event.touches[0]?.clientY || 0;
        }, { passive: true });

        feed.addEventListener("touchend", event => {
            const endY = event.changedTouches[0]?.clientY || 0;
            const delta = touchStartY - endY;

            if (Math.abs(delta) > 70) {
                const cards = $$(".video-card", feed);
                const current = activeVideo?.closest(".video-card");
                const index = cards.indexOf(current);
                const next = cards[index + (delta > 0 ? 1 : -1)];

                if (next) {
                    next.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });

                    setTimeout(refreshAutoplay, 200);
                }
            }

            touchStartY = 0;
        }, { passive: true });

        document.addEventListener("keydown", event => {
            if (event.target.matches("input, textarea, select")) return;
            if (modalOpen()) {
                if (event.key === "Escape") {
                    closeModal(createModal);
                    closeModal(commentsModal);
                }
                return;
            }

            if (event.key === "ArrowDown" || event.key === "PageDown") {
                event.preventDefault();
                scrollToNext(1);
            }

            if (event.key === "ArrowUp" || event.key === "PageUp") {
                event.preventDefault();
                scrollToNext(-1);
            }

            if (event.code === "Space" && activeVideo) {
                event.preventDefault();

                if (activeVideo.paused) playVisibleVideo(activeVideo);
                else activeVideo.pause();
            }
        });
    }

    function scrollToNext(direction) {
        const cards = $$(".video-card", feed);
        if (!cards.length) return;

        const current = activeVideo?.closest(".video-card");
        let index = cards.indexOf(current);

        if (index < 0) index = 0;

        const next = cards[
            Math.max(0, Math.min(cards.length - 1, index + direction))
        ];

        if (next) {
            next.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            setTimeout(refreshAutoplay, 250);
        }
    }

    /* ================================================
       INITIALIZATION
    ================================================ */

    function initialize() {
        feed = byId("feed") || byId("videoList");

        if (!feed) {
            console.error(
                'V-Tik: Could not find #feed or #videoList in index.html.'
            );
            return;
        }

        setupEvents();
        renderFeed();

        requestAnimationFrame(() => {
            requestAnimationFrame(refreshAutoplay);
            setTimeout(refreshAutoplay, 300);
            setTimeout(refreshAutoplay, 1000);
        });

        console.log("V-Tik initialized. Autoplay is enabled.");
    }

    window.VTik = {
        videos,
        refreshAutoplay,
        renderFeed,
        playVideo(videoId) {
            const card = findCard(videoId);
            if (card) playVisibleVideo(cardVideo(card));
        },
        setActiveTab(tab) {
            activeTab = tab;
            write("active_tab", tab);
            renderFeed();
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
