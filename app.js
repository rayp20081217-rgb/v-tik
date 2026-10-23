
"use strict";

/* ============================================================
   V-TIK — COMPLETE VIDEO SHARING APPLICATION
   ------------------------------------------------------------
   Files:
   index.html
   style.css
   app.js
   Ranking Best F1 Donut's!.mp4
   vtik-demo-2.mp4
   vtik-demo-3.mp4

   FEATURES
   - Scroll-based autoplay
   - Pause and rewind previous video
   - Muted autoplay with sound controls
   - Likes, comments, saves and follows
   - Video upload with IndexedDB persistence
   - Upload preview and drag-and-drop
   - Search and feed filters
   - Share video links
   - Fullscreen video viewer
   - Responsive navigation
   - Feed scroll buttons
============================================================ */

(() => {
    "use strict";

    /* ========================================================
       1. HELPERS
    ======================================================== */

    const $ = (selector, root = document) =>
        root?.querySelector(selector) || null;

    const $$ = (selector, root = document) =>
        root ? [...root.querySelectorAll(selector)] : [];

    const byId = id => document.getElementById(id);

    const makeId = () =>
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const escapeHTML = value =>
        String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);

    const textOr = (value, fallback) =>
        typeof value === "string" && value.trim()
            ? value.trim()
            : fallback;

    const formatCount = number => {
        number = Math.max(0, Number(number) || 0);

        if (number >= 1_000_000) {
            return `${(number / 1_000_000)
                .toFixed(1).replace(/\.0$/, "")}M`;
        }

        if (number >= 1_000) {
            return `${(number / 1_000)
                .toFixed(1).replace(/\.0$/, "")}K`;
        }

        return String(number);
    };

    const isVideoFile = file =>
        Boolean(file && file.type.startsWith("video/"));

    const MAX_VIDEO_SIZE = 250 * 1024 * 1024;

    /* ========================================================
       2. ELEMENTS AND CONFIGURATION
    ======================================================== */

    const feed = byId("feed");

    const createModal = byId("createModal");
    const commentsModal = byId("commentsModal");
    const viewer = byId("videoViewer");

    const videoPicker = byId("videoPicker");
    const uploadZone = byId("uploadZone");
    const previewContainer = byId("previewContainer");
    const uploadPreview = byId("uploadPreview");
    const uploadName = byId("uploadName");
    const videoCaption = byId("videoCaption");
    const postVideo = byId("postVideo");

    const searchInput = byId("searchInput");
    const clearSearchButton = byId("clearSearch");

    const STORAGE_KEY = "vtik_app_state_v1";
    const DB_NAME = "vtik_video_storage";
    const DB_STORE = "videos";

    const currentUser = {
        username: "you",
        displayName: "V-Tik User",
        avatar: "😎"
    };

    /* ========================================================
       3. DEMO VIDEOS
    ======================================================== */

    const DEMO_VIDEOS = [
        {
            id: "sample-vtik-1",
            username: "vtik_trending",
            displayName: "V-Tik Trending",
            avatar: "🔥",
            caption: "Welcome to V-Tik! Discover amazing videos.",
            music: "Original sound",
            src: "./Ranking Best F1 Donut's!.mp4",
            uploaded: false,
            likes: 1240,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: 3
        },
        {
            id: "sample-vtik-2",
            username: "daily_vibes",
            displayName: "Daily Vibes",
            avatar: "✨",
            caption: "Your next favorite video is waiting for you!",
            music: "Daily vibes",
            src: "./vtik-demo-2.mp4",
            uploaded: false,
            likes: 856,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: 2
        },
        {
            id: "sample-vtik-3",
            username: "fun_zone",
            displayName: "Fun Zone",
            avatar: "🎬",
            caption: "Enjoy the moment. Share the fun.",
            music: "Original sound",
            src: "./vtik-demo-3.mp4",
            uploaded: false,
            likes: 532,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: 1
        }
    ];

    const getDemoVideos = () =>
        DEMO_VIDEOS.map(video => ({
            ...video,
            comments: []
        }));

    function normalizeVideo(video) {
        return {
            id: String(video.id || makeId()),
            username: textOr(video.username, "creator"),
            displayName: textOr(video.displayName, "Creator"),
            avatar: textOr(video.avatar, "🙂"),
            caption: String(video.caption || ""),
            music: textOr(video.music, "Original sound"),
            src: String(video.src || ""),
            uploaded: Boolean(video.uploaded),
            likes: Math.max(0, Number(video.likes) || 0),
            comments: Array.isArray(video.comments)
                ? video.comments.filter(comment =>
                    comment && typeof comment === "object"
                )
                : [],
            liked: Boolean(video.liked),
            saved: Boolean(video.saved),
            following: Boolean(video.following),
            createdAt: Number(video.createdAt) || Date.now()
        };
    }

    /* ========================================================
       4. STATE AND LOCAL STORAGE
    ======================================================== */

    function loadState() {
        const defaults = {
            videos: getDemoVideos(),
            activeTab: "For You",
            currentSection: "home",
            username: currentUser.username,
            avatar: currentUser.avatar
        };

        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (!raw) return defaults;

            const saved = JSON.parse(raw);

            let videos = Array.isArray(saved.videos)
                ? saved.videos
                    .filter(video => video && video.id)
                    .map(normalizeVideo)
                : [];

            // Keep demo video paths synchronized with this version.
            videos = videos.map(video => {
                const demo = DEMO_VIDEOS.find(
                    item => item.id === video.id
                );

                return demo
                    ? {
                        ...video,
                        src: demo.src,
                        uploaded: false
                    }
                    : video;
            });

            if (!videos.length) {
                videos = getDemoVideos();
            }

            return {
                videos,
                activeTab: saved.activeTab || "For You",
                currentSection: saved.currentSection || "home",
                username: saved.username || currentUser.username,
                avatar: saved.avatar || currentUser.avatar
            };
        } catch (error) {
            console.error("V-Tik state loading failed:", error);
            return defaults;
        }
    }

    const state = loadState();

    let activeVideoId = null;
    let activeVideo = null;
    let searchTerm = "";

    let databasePromise = null;
    let toastTimer = null;
    let previewObjectURL = null;
    let viewerObjectURL = null;
    let vtikObserver = null;

    // Keep object URLs for uploaded feed videos.
    const feedObjectURLs = new Map();

    function saveState() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(state)
            );
            return true;
        } catch (error) {
            console.error("V-Tik state saving failed:", error);
            showToast("Unable to save changes in this browser.");
            return false;
        }
    }

    function getVideo(id) {
        return state.videos.find(
            video => video.id === String(id)
        );
    }

    /* ========================================================
       5. INDEXEDDB VIDEO STORAGE
    ======================================================== */

    function openDatabase() {
        if (!window.indexedDB) {
            return Promise.reject(
                new Error("IndexedDB is not supported.")
            );
        }

        if (databasePromise) return databasePromise;

        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE, {
                        keyPath: "id"
                    });
                }
            };

            request.onsuccess = () => {
                const db = request.result;

                db.onversionchange = () => {
                    db.close();
                    databasePromise = null;
                };

                resolve(db);
            };

            request.onerror = () => {
                databasePromise = null;
                reject(request.error);
            };
        });

        return databasePromise;
    }

    async function storeVideoFile(id, file) {
        const db = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(
                DB_STORE,
                "readwrite"
            );

            transaction.objectStore(DB_STORE).put({
                id,
                file,
                name: file.name,
                type: file.type
            });

            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    }

    async function retrieveVideoFile(id) {
        const db = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(
                DB_STORE,
                "readonly"
            );

            const request = transaction
                .objectStore(DB_STORE)
                .get(id);

            request.onsuccess = () =>
                resolve(request.result?.file || null);

            request.onerror = () => reject(request.error);
        });
    }

    async function removeStoredVideo(id) {
        try {
            const db = await openDatabase();

            await new Promise((resolve, reject) => {
                const transaction = db.transaction(
                    DB_STORE,
                    "readwrite"
                );

                transaction.objectStore(DB_STORE).delete(id);

                transaction.oncomplete = resolve;
                transaction.onerror = () =>
                    reject(transaction.error);
            });
        } catch (error) {
            console.warn("Could not remove stored video:", error);
        }
    }

    async function getVideoSource(video) {
        if (!video) return "";

        if (!video.uploaded) {
            return video.src;
        }

        const file = await retrieveVideoFile(video.id);

        return file ? URL.createObjectURL(file) : "";
    }

    function releaseFeedObjectURLs() {
        feedObjectURLs.forEach(url => {
            URL.revokeObjectURL(url);
        });

        feedObjectURLs.clear();
    }

    /* ========================================================
       6. TOAST NOTIFICATIONS
    ======================================================== */

    function showToast(message) {
        const toast = byId("toast") || byId("vtikToast");

        if (!toast) {
            console.info("V-Tik:", message);
            return;
        }

        toast.textContent = message;
        toast.classList.add("show", "visible");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show", "visible");
        }, 2800);
    }

    /* ========================================================
       7. VIDEO CARD
    ======================================================== */

    function createVideoCard(video) {
        const id = escapeHTML(video.id);

        return `
            <article class="video-card" data-video-id="${id}">

                <div class="video-user">
                    <div class="avatar">
                        ${escapeHTML(video.avatar)}
                    </div>

                    <div class="video-user-info">
                        <strong>@${escapeHTML(video.username)}</strong>
                        <span>${escapeHTML(video.displayName)}</span>
                    </div>

                    <button
                        type="button"
                        class="follow-btn ${video.following ? "following" : ""}"
                        data-action="follow"
                        data-video-id="${id}">
                        ${video.following ? "Following" : "Follow"}
                    </button>
                </div>

                <div class="video-stage">

                    <video
                        class="feed-video"
                        data-video-id="${id}"
                        ${video.uploaded ? "" : `src="${escapeHTML(video.src)}"`}
                        preload="metadata"
                        playsinline
                        muted
                        loop>
                    </video>

                    <div class="video-loading">
                        <span></span>
                    </div>

                    <button
                        type="button"
                        class="sound-toggle"
                        data-action="sound"
                        data-video-id="${id}"
                        aria-label="Toggle sound">
                        🔇
                    </button>

                </div>

                <div class="video-details">

                    <div class="video-caption">
                        <strong>@${escapeHTML(video.username)}</strong>
                        ${escapeHTML(video.caption)}
                    </div>

                    <div class="video-music">
                        <span>♫</span>
                        ${escapeHTML(video.music)}
                    </div>

                    <div class="video-actions">

                        <button
                            type="button"
                            class="action-btn ${video.liked ? "active liked" : ""}"
                            data-action="like"
                            data-video-id="${id}">
                            <span class="action-icon">
                                ${video.liked ? "♥" : "♡"}
                            </span>
                            <span>${formatCount(video.likes)}</span>
                        </button>

                        <button
                            type="button"
                            class="action-btn"
                            data-action="comment"
                            data-video-id="${id}">
                            <span class="action-icon">▢</span>
                            <span>${formatCount(video.comments.length)}</span>
                        </button>

                        <button
                            type="button"
                            class="action-btn ${video.saved ? "active saved" : ""}"
                            data-action="save"
                            data-video-id="${id}">
                            <span class="action-icon">
                                ${video.saved ? "★" : "☆"}
                            </span>
                            <span>${video.saved ? "Saved" : "Save"}</span>
                        </button>

                        <button
                            type="button"
                            class="action-btn"
                            data-action="share"
                            data-video-id="${id}">
                            <span class="action-icon">↗</span>
                            <span>Share</span>
                        </button>

                        <button
                            type="button"
                            class="action-btn"
                            data-action="expand"
                            data-video-id="${id}"
                            aria-label="Open fullscreen video">
                            <span class="action-icon">⛶</span>
                        </button>

                    </div>
                </div>
            </article>
        `;
    }

    /* ========================================================
       8. FEED FILTERING
    ======================================================== */

    function getVisibleVideos() {
        let videos = [...state.videos];

        switch (state.activeTab) {
            case "Following":
                videos = videos.filter(video => video.following);
                break;

            case "Liked":
                videos = videos.filter(video => video.liked);
                break;

            case "Saved":
                videos = videos.filter(video => video.saved);
                break;
        }

        if (searchTerm) {
            const query = searchTerm.toLowerCase();

            videos = videos.filter(video => [
                video.username,
                video.displayName,
                video.caption,
                video.music
            ].join(" ").toLowerCase().includes(query));
        }

        if (state.activeTab === "Trending") {
            videos.sort((a, b) => b.likes - a.likes);
        } else {
            videos.sort((a, b) => b.createdAt - a.createdAt);
        }

        return videos;
    }

    /* ========================================================
       9. VIDEO PLAYBACK — PAUSE AND REWIND
    ======================================================== */

    function rewindVideo(video) {
        if (!video) return;

        video.pause();

        if (video.readyState > 0) {
            try {
                video.currentTime = 0;
            } catch (error) {
                console.warn("Could not rewind video:", error);
            }
        } else if (!video.dataset.rewindPending) {
            video.dataset.rewindPending = "true";

            video.addEventListener("loadedmetadata", () => {
                delete video.dataset.rewindPending;

                if (!video.isConnected) return;

                try {
                    video.currentTime = 0;
                } catch (error) {
                    // Media may no longer be available.
                }
            }, { once: true });
        }
    }

    async function playViewedVideo(video) {
        if (!video || !video.isConnected) return;

        // Do not restart an already playing active video.
        if (activeVideo === video && !video.paused) return;

        // Pause and rewind the previous video.
        if (activeVideo && activeVideo !== video) {
            rewindVideo(activeVideo);
        }

        // Enforce single-video playback throughout the feed.
        $$(".feed-video", feed).forEach(otherVideo => {
            if (otherVideo !== video) {
                rewindVideo(otherVideo);
            }
        });

        activeVideo = video;
        activeVideoId = video.dataset.videoId || null;

        // Muted playback is more compatible with autoplay policies.
        video.muted = true;

        const card = video.closest(".video-card");
        const soundButton = $(".sound-toggle", card);

        if (soundButton) {
            soundButton.textContent = "🔇";
        }

        try {
            await video.play();
        } catch (error) {
            // The browser may require user interaction.
        }
    }

    function bindVideoPlayback() {
        $$(".feed-video", feed).forEach(video => {
            video.muted = true;
            video.playsInline = true;
            video.loop = true;

            video.addEventListener("loadstart", () => {
                video.closest(".video-stage")
                    ?.classList.add("is-loading");
            });

            video.addEventListener("loadeddata", () => {
                video.closest(".video-stage")
                    ?.classList.remove(
                        "is-loading",
                        "video-unavailable"
                    );
            });

            video.addEventListener("playing", () => {
                video.closest(".video-stage")
                    ?.classList.remove("is-loading");
            });
        });
    }

    function bindVideoErrors() {
        $$(".feed-video", feed).forEach(video => {
            video.addEventListener("error", () => {
                const stage = video.closest(".video-stage");
                if (!stage) return;

                stage.classList.remove("is-loading");
                stage.classList.add("video-unavailable");

                let notice = $(".video-unavailable-message", stage);

                if (!notice) {
                    notice = document.createElement("div");
                    notice.className = "video-unavailable-message";
                    stage.appendChild(notice);
                }

                notice.textContent =
                    "Video could not load. Check the file path.";

                if (activeVideo === video) {
                    activeVideo = null;
                    activeVideoId = null;
                }
            });
        });
    }

    /*
     * Load locally uploaded video files from IndexedDB.
     * Object URLs remain valid until the feed is rebuilt.
     */
    async function loadUploadedVideoSources() {
        const uploadedElements = $$(".feed-video", feed)
            .filter(video => {
                const item = getVideo(video.dataset.videoId);
                return item?.uploaded;
            });

        await Promise.all(uploadedElements.map(async video => {
            const id = video.dataset.videoId;

            try {
                const file = await retrieveVideoFile(id);

                // Ignore results for cards that have been removed.
                if (!video.isConnected) return;

                if (!file) {
                    video.closest(".video-stage")
                        ?.classList.add("video-unavailable");
                    return;
                }

                const objectURL = URL.createObjectURL(file);
                feedObjectURLs.set(id, objectURL);

                video.src = objectURL;
                video.load();
            } catch (error) {
                console.error("Uploaded video could not load:", error);
            }
        }));
    }

    function observeVideos() {
        const videos = $$(".feed-video", feed);

        if (vtikObserver) {
            vtikObserver.disconnect();
            vtikObserver = null;
        }

        // Clean up an active element removed during rerendering.
        if (activeVideo && !activeVideo.isConnected) {
            rewindVideo(activeVideo);
            activeVideo = null;
            activeVideoId = null;
        }

        if (!videos.length) {
            if (activeVideo) {
                rewindVideo(activeVideo);
                activeVideo = null;
                activeVideoId = null;
            }
            return;
        }

        if (!("IntersectionObserver" in window)) {
            // Basic fallback for older browsers.
            playViewedVideo(videos[0]);
            return;
        }

        vtikObserver = new IntersectionObserver(() => {
            // Calculate current visibility for all feed videos.
            const visibleVideos = videos
                .map(video => {
                    const rect = video.getBoundingClientRect();
                    const height = rect.height;

                    const visibleHeight = Math.max(
                        0,
                        Math.min(rect.bottom, window.innerHeight) -
                        Math.max(rect.top, 0)
                    );

                    return {
                        video,
                        ratio: height > 0
                            ? visibleHeight / height
                            : 0
                    };
                })
                .filter(item =>
                    item.ratio >= 0.6 &&
                    item.video.isConnected
                )
                .sort((a, b) => b.ratio - a.ratio);

            const nextVideo = visibleVideos[0]?.video || null;

            if (nextVideo) {
                playViewedVideo(nextVideo);
            } else if (activeVideo) {
                // Nothing is visible enough to continue playback.
                rewindVideo(activeVideo);
                activeVideo = null;
                activeVideoId = null;
            }
        }, {
            threshold: [0, 0.25, 0.6, 0.8, 1]
        });

        videos.forEach(video => {
            vtikObserver.observe(video);
        });
    }

    /* ========================================================
       10. RENDER FEED
    ======================================================== */

    function renderEmptyFeed() {
        if (!feed) return;

        feed.innerHTML = `
            <div class="empty-feed">
                <div class="empty-feed-icon">🎬</div>
                <h2>No videos found</h2>
                <p>Try another section or search for something else.</p>
                <button
                    type="button"
                    data-action="open-create"
                    class="empty-create-btn">
                    Create a video
                </button>
            </div>
        `;
    }

    function renderFeed() {
        if (!feed) {
            console.error(
                'V-Tik: Add <main id="feed"></main> to index.html.'
            );
            return;
        }

        // Stop old playback before replacing the cards.
        if (vtikObserver) {
            vtikObserver.disconnect();
            vtikObserver = null;
        }

        if (activeVideo) {
            rewindVideo(activeVideo);
            activeVideo = null;
            activeVideoId = null;
        }

        releaseFeedObjectURLs();

        const videos = getVisibleVideos();

        if (!videos.length) {
            renderEmptyFeed();
            updateSearchButton();
            return;
        }

        feed.innerHTML = videos.map(createVideoCard).join("");

        updateSearchButton();

        bindVideoPlayback();
        bindVideoErrors();

        // Upload sources and autoplay observation work together.
        loadUploadedVideoSources();
        observeVideos();
    }

    /* ========================================================
       11. LIKES, SAVES AND FOLLOWS
    ======================================================== */

    function toggleLike(id) {
        const video = getVideo(id);
        if (!video) return;

        video.liked = !video.liked;

        video.likes = Math.max(
            0,
            video.likes + (video.liked ? 1 : -1)
        );

        saveState();
        renderFeed();
    }

    function toggleSave(id) {
        const video = getVideo(id);
        if (!video) return;

        video.saved = !video.saved;

        saveState();
        renderFeed();

        showToast(video.saved
            ? "Video saved!"
            : "Video unsaved."
        );
    }

    function toggleFollow(id) {
        const video = getVideo(id);
        if (!video) return;

        video.following = !video.following;

        saveState();
        renderFeed();

        showToast(
            video.following
                ? `Following @${video.username}`
                : `Unfollowed @${video.username}`
        );
    }

    /* ========================================================
       12. COMMENTS
    ======================================================== */

    function renderComments(video) {
        const list =
            byId("commentsList") ||
            byId("comments") ||
            $(".comments-list", commentsModal);

        if (!list) return;

        if (!video.comments.length) {
            list.innerHTML = `
                <div class="no-comments">
                    Be the first to comment 💬
                </div>
            `;
            return;
        }

        list.innerHTML = video.comments.map(comment => `
            <div class="comment-item">
                <div class="avatar small">
                    ${escapeHTML(comment.avatar || "🙂")}
                </div>

                <div class="comment-content">
                    <strong>@${escapeHTML(comment.username || "user")}</strong>
                    <p>${escapeHTML(comment.text || "")}</p>
                </div>
            </div>
        `).join("");
    }

    function openComments(id) {
        const video = getVideo(id);
        if (!video || !commentsModal) return;

        activeVideoId = id;

        commentsModal.dataset.videoId = id;

        const title = byId("commentsTitle");

        if (title) {
            title.textContent = `Comments · @${video.username}`;
        }

        renderComments(video);
        showModal(commentsModal);

        byId("commentInput")?.focus();
    }

    function addComment(id, text) {
        const video = getVideo(id);
        text = String(text || "").trim();

        if (!video || !text) return;

        video.comments.push({
            id: makeId(),
            username: state.username || currentUser.username,
            avatar: state.avatar || currentUser.avatar,
            text,
            createdAt: Date.now()
        });

        saveState();

        // Rebuild the feed but preserve the comments target.
        renderFeed();
        openComments(id);

        showToast("Comment added!");
    }

    function bindCommentForm() {
        const form = byId("commentForm");
        const input = byId("commentInput");

        if (!form || form.dataset.vtikBound) return;

        form.dataset.vtikBound = "true";

        form.addEventListener("submit", event => {
            event.preventDefault();

            const id = commentsModal?.dataset.videoId
                || activeVideoId;

            if (!id || !input) return;

            addComment(id, input.value);
            input.value = "";

            const button = byId("postCommentBtn");

            if (button) button.disabled = true;
        });

        input?.addEventListener("input", () => {
            const button = byId("postCommentBtn");

            if (button) {
                button.disabled = !input.value.trim();
            }
        });
    }

    /* ========================================================
       13. SHARE VIDEO
    ======================================================== */

    async function shareVideo(id) {
        const video = getVideo(id);
        if (!video) return;

        const url =
            `${location.href.split("#")[0]}#video-${encodeURIComponent(id)}`;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: `V-Tik video by @${video.username}`,
                    text: video.caption,
                    url
                });
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
                showToast("Video link copied!");
            } else {
                window.prompt("Copy video link:", url);
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                showToast("Could not share video.");
            }
        }
    }

    /* ========================================================
       14. MODAL MANAGEMENT
    ======================================================== */

    function showModal(modal) {
        if (!modal) return;

        modal.hidden = false;
        modal.classList.add("active", "open");
        modal.setAttribute("aria-hidden", "false");

        document.body.classList.add("modal-open");
    }

    function hideModal(modal) {
        if (!modal) return;

        modal.classList.remove("active", "open");
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");

        const visibleModal = $$(".modal, .viewer").some(item =>
            !item.hidden &&
            (
                item.classList.contains("active") ||
                item.classList.contains("open")
            )
        );

        if (!visibleModal) {
            document.body.classList.remove("modal-open");
        }
    }

    function openCreateModal() {
        if (!createModal) {
            showToast("Create modal was not found in index.html.");
            return;
        }

        showModal(createModal);
    }

    /* ========================================================
       15. UPLOAD PREVIEW
    ======================================================== */

    function clearPreview() {
        if (uploadPreview) {
            uploadPreview.pause();
            uploadPreview.removeAttribute("src");
            uploadPreview.load();
        }

        if (previewObjectURL) {
            URL.revokeObjectURL(previewObjectURL);
            previewObjectURL = null;
        }

        if (previewContainer) {
            previewContainer.hidden = true;
            previewContainer.classList.remove("has-preview");
        }

        if (uploadZone) {
            uploadZone.hidden = false;
            uploadZone.classList.remove("dragging");
        }

        if (uploadName) {
            uploadName.textContent = "";
        }

        if (postVideo) {
            postVideo.disabled = true;
        }
    }

    function previewSelectedVideo(file) {
        clearPreview();

        if (!file) return;

        if (!isVideoFile(file)) {
            showToast("Select a video file.");

            if (videoPicker) videoPicker.value = "";

            return;
        }

        if (file.size > MAX_VIDEO_SIZE) {
            showToast("Maximum upload size is 250 MB.");

            if (videoPicker) videoPicker.value = "";

            return;
        }

        previewObjectURL = URL.createObjectURL(file);

        if (uploadPreview) {
            uploadPreview.src = previewObjectURL;
            uploadPreview.load();
        }

        if (uploadName) {
            uploadName.textContent = file.name;
        }

        if (previewContainer) {
            previewContainer.hidden = false;
            previewContainer.classList.add("has-preview");
        }

        if (uploadZone) {
            uploadZone.hidden = true;
        }

        if (postVideo) {
            postVideo.disabled = false;
        }
    }

    /* ========================================================
       16. PUBLISH VIDEO
    ======================================================== */

    async function uploadVideo() {
        const file = videoPicker?.files?.[0];

        if (!file) {
            showToast("Select a video first.");
            return;
        }

        if (!isVideoFile(file)) {
            showToast("The selected file is not a video.");
            return;
        }

        if (file.size > MAX_VIDEO_SIZE) {
            showToast("Video must be smaller than 250 MB.");
            return;
        }

        const button = postVideo;

        if (button) {
            button.disabled = true;
            button.textContent = "Publishing...";
        }

        const displayName =
            state.username || currentUser.displayName;

        const video = {
            id: makeId(),
            username: displayName
                .replace(/^@/, "")
                .trim()
                .replace(/\s+/g, "_") || "you",
            displayName,
            avatar: state.avatar || currentUser.avatar,
            caption: videoCaption?.value.trim() || "",
            music: "Original sound",
            src: "",
            uploaded: true,
            likes: 0,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: Date.now()
        };

        try {
            // Store the actual file, not a temporary blob URL.
            await storeVideoFile(video.id, file);

            state.videos.unshift(video);
            state.activeTab = "For You";
            state.currentSection = "home";

            searchTerm = "";

            if (searchInput) {
                searchInput.value = "";
            }

            saveState();
            updateNavigation("home");
            renderFeed();

            if (videoPicker) {
                videoPicker.value = "";
            }

            if (videoCaption) {
                videoCaption.value = "";
            }

            clearPreview();
            hideModal(createModal);

            showToast("Your video has been published! 🎉");
        } catch (error) {
            console.error("Video upload failed:", error);

            showToast(
                "Upload failed. Check browser storage permissions."
            );
        } finally {
            if (button) {
                button.textContent = "Post Video";
                button.disabled = !videoPicker?.files?.length;
            }
        }
    }

    function bindUploadControls() {
        videoPicker?.addEventListener("change", () => {
            previewSelectedVideo(videoPicker.files?.[0]);
        });

        postVideo?.addEventListener("click", event => {
            event.preventDefault();
            uploadVideo();
        });

        if (!uploadZone) return;

        uploadZone.addEventListener("dragover", event => {
            event.preventDefault();
            uploadZone.classList.add("dragging");
        });

        uploadZone.addEventListener("dragleave", () => {
            uploadZone.classList.remove("dragging");
        });

        uploadZone.addEventListener("drop", event => {
            event.preventDefault();
            uploadZone.classList.remove("dragging");

            const file = event.dataTransfer?.files?.[0];

            if (!file) return;

            if (!isVideoFile(file)) {
                showToast("Drop a valid video file.");
                return;
            }

            if (file.size > MAX_VIDEO_SIZE) {
                showToast("Maximum upload size is 250 MB.");
                return;
            }

            try {
                const transfer = new DataTransfer();
                transfer.items.add(file);

                if (videoPicker) {
                    videoPicker.files = transfer.files;
                }
            } catch (error) {
                console.warn(
                    "Could not assign dropped file to input:",
                    error
                );
            }

            previewSelectedVideo(file);
        });
    }

    /* ========================================================
       17. FULLSCREEN VIDEO VIEWER
    ======================================================== */

    async function openViewer(id) {
        const video = getVideo(id);
        if (!video || !viewer) return;

        const viewerVideo =
            byId("viewerVideo") || $("video", viewer);

        if (!viewerVideo) {
            showToast("Add a video element to the viewer.");
            return;
        }

        if (viewerObjectURL) {
            URL.revokeObjectURL(viewerObjectURL);
            viewerObjectURL = null;
        }

        let source = "";

        try {
            source = await getVideoSource(video);
        } catch (error) {
            console.error("Could not load viewer video:", error);
        }

        if (!source) {
            showToast("Video file is unavailable.");
            return;
        }

        // Protect uploaded-video URLs until the viewer closes.
        if (source.startsWith("blob:")) {
            viewerObjectURL = source;
        }

        // Stop the feed video before playing the viewer.
        if (activeVideo) {
            rewindVideo(activeVideo);
            activeVideo = null;
            activeVideoId = null;
        }

        viewerVideo.src = source;
        viewerVideo.loop = true;
        viewerVideo.playsInline = true;
        viewerVideo.muted = false;

        showModal(viewer);

        viewerVideo.play().catch(() => {});
    }

    function closeViewer() {
        if (!viewer) return;

        const viewerVideo =
            byId("viewerVideo") || $("video", viewer);

        if (viewerVideo) {
            viewerVideo.pause();
            viewerVideo.removeAttribute("src");
            viewerVideo.load();
        }

        if (viewerObjectURL) {
            URL.revokeObjectURL(viewerObjectURL);
            viewerObjectURL = null;
        }

        hideModal(viewer);
    }

    /* ========================================================
       18. NAVIGATION
    ======================================================== */

    const sectionTabs = {
        home: "For You",
        discover: "For You",
        following: "Following",
        liked: "Liked",
        saved: "Saved",
        trending: "Trending",
        messages: "For You",
        music: "For You",
        gaming: "For You",
        challenges: "For You"
    };

    function updateNavigation(section) {
        $$("[data-section]").forEach(button => {
            const isActive = button.dataset.section === section;

            button.classList.toggle("active", isActive);

            if (isActive) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });
    }

    function setActiveTab(section) {
        if (!Object.hasOwn(sectionTabs, section)) {
            section = "home";
        }

        state.currentSection = section;
        state.activeTab = sectionTabs[section];

        updateNavigation(section);
        saveState();

        if (section === "messages") {
            showToast("Messaging is not connected yet.");
        }

        if (["music", "gaming", "challenges"].includes(section)) {
            showToast("This section is coming soon.");
        }

        renderFeed();
    }

    function bindNavigation() {
        document.addEventListener("click", event => {
            const button = event.target.closest("[data-section]");

            if (!button) return;

            event.preventDefault();
            setActiveTab(button.dataset.section);
        });
    }

    /* ========================================================
       19. SEARCH
    ======================================================== */

    function updateSearchButton() {
        if (clearSearchButton) {
            clearSearchButton.hidden =
                !(searchInput?.value || "").length;
        }
    }

    function bindSearch() {
        if (!searchInput) return;

        searchInput.addEventListener("input", () => {
            searchTerm = searchInput.value.trim();

            updateSearchButton();
            renderFeed();
        });

        clearSearchButton?.addEventListener("click", () => {
            searchInput.value = "";
            searchTerm = "";

            updateSearchButton();
            renderFeed();

            searchInput.focus();
        });

        searchInput.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;

            searchInput.value = "";
            searchTerm = "";

            updateSearchButton();
            renderFeed();
        });

        updateSearchButton();
    }

    /* ========================================================
       20. FEED ACTIONS
    ======================================================== */

    function bindFeedActions() {
        if (!feed) return;

        // One delegated listener handles all feed actions,
        // including sound, to avoid duplicate click handlers.
        feed.addEventListener("click", event => {
            const button = event.target.closest("[data-action]");

            if (!button || !feed.contains(button)) return;

            const action = button.dataset.action;

            const id = button.dataset.videoId ||
                button.closest("[data-video-id]")?.dataset.videoId;

            if (action === "open-create") {
                openCreateModal();
                return;
            }

            if (action === "sound") {
                const card = button.closest(".video-card");
                const video = $(".feed-video", card);

                if (!video) return;

                video.muted = !video.muted;

                button.textContent = video.muted ? "🔇" : "🔊";

                return;
            }

            if (!id) return;

            switch (action) {
                case "like":
                    toggleLike(id);
                    break;

                case "save":
                    toggleSave(id);
                    break;

                case "follow":
                    toggleFollow(id);
                    break;

                case "comment":
                    openComments(id);
                    break;

                case "share":
                    shareVideo(id);
                    break;

                case "expand":
                    openViewer(id);
                    break;
            }
        });
    }

    /* ========================================================
       21. MODAL CONTROLS
    ======================================================== */

    function bindModalControls() {
        ["createTop", "mobileCreate"].forEach(id => {
            byId(id)?.addEventListener("click", event => {
                event.preventDefault();
                openCreateModal();
            });
        });

        byId("closeCreate")?.addEventListener("click", () => {
            hideModal(createModal);
        });

        byId("closeComments")?.addEventListener("click", () => {
            hideModal(commentsModal);
        });

        byId("viewerClose")?.addEventListener("click", closeViewer);

        [createModal, commentsModal].forEach(modal => {
            if (!modal) return;

            modal.addEventListener("click", event => {
                if (event.target === modal) {
                    hideModal(modal);
                }
            });
        });

        document.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;

            hideModal(createModal);
            hideModal(commentsModal);
            closeViewer();
        });
    }

    /* ========================================================
       22. FEED SCROLL CONTROLS
    ======================================================== */

    function bindScrollControls() {
        const upButton = byId("scrollUp");
        const downButton = byId("scrollDown");

        function getFeedCards() {
            return $$(".video-card, .video-item, .feed-card", feed)
                .filter(card => card.getClientRects().length > 0);
        }

        function scrollToCard(direction) {
            const cards = getFeedCards();

            if (!cards.length) {
                window.scrollBy({
                    top: direction * window.innerHeight * 0.75,
                    behavior: "smooth"
                });
                return;
            }

            const currentPosition = window.scrollY + 100;

            if (direction > 0) {
                const nextCard = cards.find(card =>
                    card.getBoundingClientRect().top +
                    window.scrollY > currentPosition + 20
                );

                if (nextCard) {
                    nextCard.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                } else {
                    window.scrollTo({
                        top: document.documentElement.scrollHeight,
                        behavior: "smooth"
                    });
                }

                return;
            }

            const previousCards = cards.filter(card =>
                card.getBoundingClientRect().top +
                window.scrollY < currentPosition - 20
            );

            const previousCard =
                previousCards[previousCards.length - 1];

            if (previousCard) {
                previousCard.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            } else {
                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });
            }
        }

        upButton?.addEventListener("click", () => {
            scrollToCard(-1);
        });

        downButton?.addEventListener("click", () => {
            scrollToCard(1);
        });
    }

    /* ========================================================
       23. STARTUP
    ======================================================== */

    function initializeVtik() {
        bindNavigation();
        bindSearch();
        bindFeedActions();
        bindModalControls();
        bindUploadControls();
        bindCommentForm();
        bindScrollControls();

        // Never open dialogs automatically at startup.
        [createModal, commentsModal, viewer].forEach(modal => {
            if (!modal) return;

            modal.hidden = true;
            modal.classList.remove("active", "open");
            modal.setAttribute("aria-hidden", "true");
        });

        document.body.classList.remove("modal-open");

        updateNavigation(state.currentSection || "home");
        updateSearchButton();

        renderFeed();

        // Support direct links such as #video-sample-vtik-2.
        const match = location.hash.match(/^#video-(.+)$/);

        if (match) {
            const targetId = decodeURIComponent(match[1]);
            const targetVideo = getVideo(targetId);

            if (targetVideo) {
                state.activeTab = "For You";
                state.currentSection = "home";

                updateNavigation("home");
                renderFeed();

                requestAnimationFrame(() => {
                    const card = $(
                        `[data-video-id="${CSS.escape(targetId)}"]`,
                        feed
                    );

                    card?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                });
            }
        }

        console.info("V-Tik initialized successfully.");
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
