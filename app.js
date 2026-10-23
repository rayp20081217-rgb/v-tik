
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
============================================================ */

(() => {
    /* ========================================================
       1. HELP
    ======================================================== */

    const $ = (selector, root = document) =>
        root ? root.querySelector(selector) : null;

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

    const formatCount = number => {
        number = Number(number) || 0;

        if (number >= 1_000_000) {
            return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
        }

        if (number >= 1_000) {
            return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
        }

        return String(number);
    };

    const textOr = (value, fallback) =>
        typeof value === "string" && value.trim()
            ? value.trim()
            : fallback;

    /* ========================================================
       2. ELEMENTS
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
       3. LOCAL DEMO VIDEOS

       IMPORTANT:
       These files must be in the same public directory
       as index.html.

       Use exact filenames, including capitalization.
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

    function getDemoVideos() {
        return DEMO_VIDEOS.map(video => ({
            ...video,
            comments: []
        }));
    }

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
                ? video.comments
                : [],
            liked: Boolean(video.liked),
            saved: Boolean(video.saved),
            following: Boolean(video.following),
            createdAt: Number(video.createdAt) || Date.now()
        };
    }

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

            /*
             * Keep locally hosted demo paths current.
             * This fixes previously saved online demo URLs.
             */
            videos = videos.map(video => {
                const demo = DEMO_VIDEOS.find(
                    item => item.id === video.id
                );

                if (demo) {
                    return {
                        ...video,
                        src: demo.src,
                        uploaded: false
                    };
                }

                return video;
            });

            if (videos.length === 0) {
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
    let searchTerm = "";
    let databasePromise = null;
    let toastTimer = null;
    let previewObjectURL = null;
    let viewerObjectURL = null;

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
       4. INDEXEDDB FOR UPLOADED VIDEO FILES
    ======================================================== */

    function openDatabase() {
        if (!window.indexedDB) {
            return Promise.reject(
                new Error("IndexedDB is not supported by this browser.")
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

            request.onsuccess = () => resolve(request.result);

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
            const transaction = db.transaction(DB_STORE, "readwrite");

            transaction.objectStore(DB_STORE).put({
                id,
                file,
                name: file.name,
                type: file.type
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    }

    async function retrieveVideoFile(id) {
        const db = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(DB_STORE, "readonly");
            const request = transaction.objectStore(DB_STORE).get(id);

            request.onsuccess = () =>
                resolve(request.result?.file || null);

            request.onerror = () => reject(request.error);
        });
    }

    async function removeStoredVideo(id) {
        try {
            const db = await openDatabase();

            await new Promise((resolve, reject) => {
                const transaction = db.transaction(DB_STORE, "readwrite");

                transaction.objectStore(DB_STORE).delete(id);

                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
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

        if (!file) return "";

        return URL.createObjectURL(file);
    }

    /* ========================================================
       5. TOAST NOTIFICATIONS
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
       6. VIDEO CARD
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
                        src="${escapeHTML(video.src)}"
                        preload="metadata"
                        playsinline
                        muted
                        loop
                        controls>
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
                            data-video-id="${id}">
                            <span class="action-icon">⛶</span>
                        </button>

                    </div>
                </div>
            </article>
        `;
    }

    /* ========================================================
       7. FEED FILTERS
    ======================================================== */

    function getVisibleVideos() {
        let videos = [...state.videos];

        if (state.activeTab === "Following") {
            videos = videos.filter(video => video.following);
        }

        if (state.activeTab === "Liked") {
            videos = videos.filter(video => video.liked);
        }

        if (state.activeTab === "Saved") {
            videos = videos.filter(video => video.saved);
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
       8. RENDER FEED
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
            console.error("V-Tik: Add <main id=\"feed\"></main> to index.html.");
            return;
        }

        const videos = getVisibleVideos();

        if (window.vtikObserver) {
            window.vtikObserver.disconnect();
        }

        if (videos.length === 0) {
            renderEmptyFeed();
            updateSearchButton();
            return;
        }

        feed.innerHTML = videos.map(createVideoCard).join("");

        updateSearchButton();
        bindVideoPlayback();
        bindVideoErrors();
        bindVideoSoundButtons();
        observeVideos();
    }

    /* ========================================================
       9. VIDEO PLAYBACK

       The video src attribute uses local relative paths.
       Example: ./vtik-demo-1.mp4
    ======================================================== */

    function bindVideoPlayback() {
        $$(".feed-video", feed).forEach(video => {
            video.muted = true;

            video.addEventListener("loadeddata", () => {
                video.closest(".video-stage")
                    ?.classList.remove("is-loading", "video-unavailable");
            }, { once: true });

            video.addEventListener("loadstart", () => {
                video.closest(".video-stage")
                    ?.classList.add("is-loading");
            }, { once: true });
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
            });
        });
    }

    function observeVideos() {
        const videos = $$(".feed-video", feed);

        if (!("IntersectionObserver" in window)) return;

        window.vtikObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const video = entry.target;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    videos.forEach(other => {
                        if (other !== video) other.pause();
                    });

                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });
        }, {
            threshold: [0, 0.6, 1]
        });

        videos.forEach(video => window.vtikObserver.observe(video));
    }

    function bindVideoSoundButtons() {
        $$(".sound-toggle", feed).forEach(button => {
            button.addEventListener("click", () => {
                const card = button.closest(".video-card");
                const video = $(".feed-video", card);

                if (!video) return;

                video.muted = !video.muted;
                button.textContent = video.muted ? "🔇" : "🔊";
            });
        });
    }

    /* ========================================================
       10. LIKES, SAVES AND FOLLOWS
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

        showToast(video.saved ? "Video saved!" : "Video unsaved.");
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
       11. COMMENTS
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
        if (title) title.textContent = `Comments · @${video.username}`;

        renderComments(video);
        showModal(commentsModal);

        byId("commentInput")?.focus();
    }

    function addComment(id, text) {
        const video = getVideo(id);
        text = text.trim();

        if (!video || !text) return;

        video.comments.push({
            id: makeId(),
            username: state.username || currentUser.username,
            avatar: state.avatar || currentUser.avatar,
            text,
            createdAt: Date.now()
        });

        saveState();
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

            if (!activeVideoId || !input) return;

            addComment(activeVideoId, input.value);

            input.value = "";

            const button = byId("postCommentBtn");
            if (button) button.disabled = true;
        });

        input?.addEventListener("input", () => {
            const button = byId("postCommentBtn");
            if (button) button.disabled = !input.value.trim();
        });
    }

    /* ========================================================
       12. SHARE VIDEO
    ======================================================== */

    async function shareVideo(id) {
        const video = getVideo(id);
        if (!video) return;

        const url = `${location.href.split("#")[0]}#video-${encodeURIComponent(id)}`;

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
       13. MODAL MANAGEMENT
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
            (item.classList.contains("active") ||
             item.classList.contains("open"))
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
       14. UPLOAD PREVIEW
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

        if (uploadName) uploadName.textContent = "";
        if (postVideo) postVideo.disabled = true;
    }

    function previewSelectedVideo(file) {
        clearPreview();

        if (!file) return;

        if (!file.type.startsWith("video/")) {
            showToast("Select a video file.");
            if (videoPicker) videoPicker.value = "";
            return;
        }

        if (file.size > 250 * 1024 * 1024) {
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
       15. PUBLISH UPLOADED VIDEO
    ======================================================== */

    async function uploadVideo() {
        const file = videoPicker?.files?.[0];

        if (!file) {
            showToast("Select a video first.");
            return;
        }

        if (!file.type.startsWith("video/")) {
            showToast("The selected file is not a video.");
            return;
        }

        if (file.size > 250 * 1024 * 1024) {
            showToast("Video must be smaller than 250 MB.");
            return;
        }

        const button = postVideo;

        if (button) {
            button.disabled = true;
            button.textContent = "Publishing...";
        }

        const username = state.username || currentUser.username;

        const video = {
            id: makeId(),
            username: username.replace(/^@/, "").replace(/\s+/g, "_"),
            displayName: username,
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
            await storeVideoFile(video.id, file);

            state.videos.unshift(video);
            state.activeTab = "For You";
            state.currentSection = "home";

            searchTerm = "";

            if (searchInput) searchInput.value = "";

            saveState();
            updateNavigation("home");
            renderFeed();

            videoPicker.value = "";

            if (videoCaption) videoCaption.value = "";

            clearPreview();
            hideModal(createModal);

            showToast("Your video has been published! 🎉");
        } catch (error) {
            console.error("Video upload failed:", error);
            showToast("Upload failed. Please check browser storage.");
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

        if (uploadZone) {
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

                if (!file.type.startsWith("video/")) {
                    showToast("Drop a valid video file.");
                    return;
                }

                try {
                    const transfer = new DataTransfer();
                    transfer.items.add(file);
                    videoPicker.files = transfer.files;
                } catch (error) {
                    console.warn("Unable to assign dropped file to input.", error);
                }

                previewSelectedVideo(file);
            });
        }
    }

    /* ========================================================
       16. FULLSCREEN VIDEO VIEWER
    ======================================================== */

    async function openViewer(id) {
        const video = getVideo(id);

        if (!video || !viewer) return;

        const viewerVideo =
            byId("viewerVideo") || $("video", viewer);

        if (!viewerVideo) {
            showToast("Add a video element to the viewer in index.html.");
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

        if (source.startsWith("blob:")) {
            viewerObjectURL = source;
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
       17. NAVIGATION
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
       18. SEARCH
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
            if (event.key === "Escape") {
                searchInput.value = "";
                searchTerm = "";
                updateSearchButton();
                renderFeed();
            }
        });

        updateSearchButton();
    }

    /* ========================================================
       19. FEED BUTTON EVENTS
    ======================================================== */

    function bindFeedActions() {
        if (!feed) return;

        feed.addEventListener("click", event => {
            const button = event.target.closest("[data-action]");
            if (!button) return;

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

                if (video) {
                    video.muted = !video.muted;
                    button.textContent = video.muted ? "🔇" : "🔊";
                }

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
       20. CREATE BUTTON AND MODAL CONTROLS
    ======================================================== */

    function bindModalControls() {
        ["createTop", "mobileCreate"].forEach(id => {
            const button = byId(id);

            if (!button) return;

            button.addEventListener("click", event => {
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
       21. STARTUP
    ======================================================== */

    function initializeVtik() {
        bindNavigation();
        bindSearch();
        bindFeedActions();
        bindModalControls();
        bindUploadControls();
        bindCommentForm();

        /*
         * Do not show upload, comments or viewer windows
         * automatically when the page loads.
         */
        [createModal, commentsModal, viewer].forEach(modal => {
            if (!modal) return;

            modal.hidden = true;
            modal.classList.remove("active", "open");
            modal.setAttribute("aria-hidden", "true");
        });

        document.body.classList.remove("modal-open");

        updateNavigation(state.currentSection || "home");
        updateSearchButton();

        // Render sample cards immediately.
        renderFeed();

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

/* =========================================================
   V-TIK — VIDEO FEED SCROLL CONTROLS
========================================================= */

(() => {
    const upButton = document.getElementById("scrollUp");
    const downButton = document.getElementById("scrollDown");

    if (!upButton || !downButton) return;

    function getFeedCards() {
        const feed = document.getElementById("feed");
        if (!feed) return [];

        return Array.from(
            feed.querySelectorAll(
                ".video-card, .video-item, .feed-card"
            )
        ).filter(card => card.getClientRects().length > 0);
    }

    function scrollToNextCard(direction) {
        const cards = getFeedCards();

        if (cards.length === 0) {
            window.scrollBy({
                top: direction * window.innerHeight * 0.75,
                behavior: "smooth"
            });
            return;
        }

        const threshold = 20;
        const currentPosition = window.scrollY + 100;

        if (direction > 0) {
            const nextCard = cards.find(card => {
                return card.getBoundingClientRect().top + window.scrollY
                    > currentPosition + threshold;
            });

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
        } else {
            const previousCards = cards.filter(card => {
                return card.getBoundingClientRect().top + window.scrollY
                    < currentPosition - threshold;
            });

            const previousCard = previousCards[previousCards.length - 1];

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
    }

    upButton.addEventListener("click", () => {
        scrollToNextCard(-1);
    });

    downButton.addEventListener("click", () => {
        scrollToNextCard(1);
    });
})();



/* =========================================
   V-TIK — PLAY VIEWED VIDEO, REWIND PREVIOUS
========================================= */

async function playViewedVideo(video) {
    if (activeVideo === video) return;

    // Pause and rewind the previously viewed video.
    if (activeVideo) {
        activeVideo.pause();

        try {
            activeVideo.currentTime = 0;
        } catch (error) {
            // Rewind when the media is ready if necessary.
            activeVideo.addEventListener("loadedmetadata", () => {
                activeVideo.currentTime = 0;
            }, { once: true });
        }
    }

    // Pause all other videos and rewind them.
    document.querySelectorAll("#videoList .feed-video").forEach((otherVideo) => {
        if (otherVideo !== video) {
            otherVideo.pause();

            if (otherVideo.readyState > 0) {
                otherVideo.currentTime = 0;
            }
        }
    });

    activeVideo = video;

    try {
        await video.play();
    } catch (error) {
        // The browser may block autoplay.
    }
}
