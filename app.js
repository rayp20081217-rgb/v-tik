
"use strict";

/* =========================================================
   V-TIK — COMPLETE APP.JS
   Feed • Uploads • Likes • Comments • Saves • Follows
   Search • Navigation • Sharing • Fullscreen • Mobile
========================================================= */

(() => {
    /* 1. HELPERS */

    const $ = (selector, parent = document) =>
        parent?.querySelector(selector) || null;

    const $$ = (selector, parent = document) =>
        parent ? Array.from(parent.querySelectorAll(selector)) : [];

    const byId = id => document.getElementById(id);

    const makeId = () =>
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const safeText = (value, fallback = "") =>
        typeof value === "string" && value.trim()
            ? value.trim()
            : fallback;

    const escapeHTML = value =>
        String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);

    const formatCount = value => {
        const number = Number(value) || 0;

        if (number >= 1_000_000) {
            return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
        }

        if (number >= 1_000) {
            return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
        }

        return String(number);
    };

    const safeRevokeObjectURL = url => {
        if (url && url.startsWith("blob:")) {
            try {
                URL.revokeObjectURL(url);
            } catch (_) {}
        }
    };

    /* 2. HTML ELEMENTS */

    const feed = byId("feed") || $(".feed");
    const searchInput = byId("searchInput") || $(".search input");
    const clearSearchButton = byId("clearSearch");

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

    const currentUser = {
        username: "you",
        displayName: "V-Tik User",
        avatar: "😎"
    };

    /* 3. STORAGE AND DEFAULT VIDEOS */

    const STORAGE_KEY = "vtik_app_state_v1";
    const VIDEO_DB_NAME = "vtik_video_storage";
    const VIDEO_STORE_NAME = "videos";

    /*
     * These are sample videos. They are shown when there are
     * no saved videos. Replace the URLs with your own videos
     * whenever you are ready.
     */
    const DEMO_VIDEOS = [
        {
            id: "sample-vtik-1",
            username: "vtik_trending",
            displayName: "V-Tik Trending",
            avatar: "🔥",
            caption: "Welcome to V-Tik! Discover amazing videos.",
            music: "Original sound",
            src: "vtik-demo-1.mp4",
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
            src: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
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
            src: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
            uploaded: false,
            likes: 532,
            comments: [],
            liked: false,
            saved: false,
            following: false,
            createdAt: 1
        }
    ];

    function createDefaultVideos() {
        return DEMO_VIDEOS.map(video => ({
            ...video,
            comments: []
        }));
    }

    function normalizeVideo(video) {
        return {
            id: String(video.id || makeId()),
            username: safeText(video.username, "creator"),
            displayName: safeText(
                video.displayName,
                safeText(video.username, "creator")
            ),
            avatar: safeText(video.avatar, "🙂"),
            caption: typeof video.caption === "string" ? video.caption : "",
            music: safeText(video.music, "Original sound"),
            src: typeof video.src === "string" ? video.src : "",
            uploaded: Boolean(video.uploaded),
            likes: Math.max(0, Number(video.likes) || 0),
            comments: Array.isArray(video.comments) ? video.comments : [],
            liked: Boolean(video.liked),
            saved: Boolean(video.saved),
            following: Boolean(video.following),
            createdAt: Number(video.createdAt) || Date.now()
        };
    }

    function loadState() {
        const defaults = {
            videos: createDefaultVideos(),
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
                    .filter(video =>
                        !/^vtik-demo-/i.test(String(video.src || ""))
                    )
                    .map(normalizeVideo)
                : [];

            /*
             * Older versions may have saved an empty array.
             * Restore sample cards instead of showing a blank feed.
             */
            if (videos.length === 0) {
                videos = createDefaultVideos();
            }

            return {
                videos,
                activeTab: saved.activeTab || "For You",
                currentSection: saved.currentSection || "home",
                username: saved.username || currentUser.username,
                avatar: saved.avatar || currentUser.avatar
            };
        } catch (error) {
            console.warn("V-Tik: Could not read saved state.", error);
            return defaults;
        }
    }

    const state = loadState();

    let activeVideoId = null;
    let searchTerm = "";
    let dbPromise = null;
    let toastTimer = null;
    let previewObjectUrl = null;
    let viewerObjectUrl = null;

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error("V-Tik: Could not save state.", error);
            showToast("Could not save changes in this browser.");
            return false;
        }
    }

    function getVideo(id) {
        return state.videos.find(video => video.id === String(id));
    }

    function getAvatar() {
        return safeText(state.avatar, currentUser.avatar);
    }

    /* 4. INDEXEDDB VIDEO STORAGE */

    function openVideoDB() {
        if (!("indexedDB" in window)) {
            return Promise.reject(
                new Error("This browser does not support IndexedDB.")
            );
        }

        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(VIDEO_DB_NAME, 1);

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
                    db.createObjectStore(VIDEO_STORE_NAME, {
                        keyPath: "id"
                    });
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => db.close();
                resolve(db);
            };

            request.onerror = () => {
                dbPromise = null;
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn("V-Tik: Video storage is blocked by another tab.");
            };
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
            transaction.onabort = () => reject(transaction.error);
        });
    }

    async function getVideoFile(id) {
        const db = await openVideoDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(VIDEO_STORE_NAME, "readonly");
            const request = transaction.objectStore(VIDEO_STORE_NAME).get(id);

            request.onsuccess = () =>
                resolve(request.result?.file || null);

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
                transaction.onabort = () => reject(transaction.error);
            });
        } catch (error) {
            console.warn("V-Tik: Could not delete video file.", error);
        }
    }

    async function resolveVideoSource(video) {
        if (!video) return "";

        if (video.uploaded) {
            const file = await getVideoFile(video.id);
            return file ? URL.createObjectURL(file) : "";
        }

        return video.src || "";
    }

    /* 5. TOAST */

    function showToast(message) {
        const toast = byId("toast") || byId("vtikToast");

        if (!toast) {
            console.info("V-Tik:", message);
            return;
        }

        toast.textContent = message;
        toast.classList.add("show", "visible");

        if (toastTimer) clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show", "visible");
        }, 2800);
    }

    /* 6. VIDEO CARD HTML */

    function videoCardHTML(video) {
        const id = escapeHTML(video.id);
        const username = safeText(video.username, "creator");
        const displayName = safeText(video.displayName, username);
        const avatar = safeText(video.avatar, "🙂");
        const caption = safeText(video.caption, "");
        const music = safeText(video.music, "Original sound");

        return `
            <article class="video-card" data-video-id="${id}">
                <div class="video-user">
                    <div class="avatar">${escapeHTML(avatar)}</div>

                    <div class="video-user-info">
                        <strong>@${escapeHTML(username)}</strong>
                        <span>${escapeHTML(displayName)}</span>
                    </div>

                    <button
                        class="follow-btn ${video.following ? "following" : ""}"
                        type="button"
                        data-action="follow"
                        data-video-id="${id}">
                        ${video.following ? "Following" : "Follow"}
                    </button>
                </div>

                <div class="video-stage">
                    <video
                        class="feed-video"
                        data-video-id="${id}"
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

                    <button
                        class="sound-toggle"
                        type="button"
                        data-action="sound"
                        data-video-id="${id}"
                        aria-label="Toggle sound">
                        🔇
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
                        <button
                            class="action-btn ${video.liked ? "active liked" : ""}"
                            type="button"
                            data-action="like"
                            data-video-id="${id}"
                            aria-label="Like video">
                            <span class="action-icon">${video.liked ? "♥" : "♡"}</span>
                            <span>${formatCount(video.likes)}</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="comment"
                            data-video-id="${id}"
                            aria-label="Comments">
                            <span class="action-icon">▢</span>
                            <span>${formatCount(video.comments.length)}</span>
                        </button>

                        <button
                            class="action-btn ${video.saved ? "active saved" : ""}"
                            type="button"
                            data-action="save"
                            data-video-id="${id}"
                            aria-label="Save video">
                            <span class="action-icon">${video.saved ? "★" : "☆"}</span>
                            <span>${video.saved ? "Saved" : "Save"}</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="share"
                            data-video-id="${id}"
                            aria-label="Share video">
                            <span class="action-icon">↗</span>
                            <span>Share</span>
                        </button>

                        <button
                            class="action-btn"
                            type="button"
                            data-action="expand"
                            data-video-id="${id}"
                            aria-label="Open fullscreen">
                            <span class="action-icon">⛶</span>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    /* 7. FILTER AND RENDER FEED */

    function getVisibleVideos() {
        let videos = [...state.videos];

        if (state.activeTab === "Following") {
            videos = videos.filter(video => video.following);
        } else if (state.activeTab === "Saved") {
            videos = videos.filter(video => video.saved);
        } else if (state.activeTab === "Liked") {
            videos = videos.filter(video => video.liked);
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();

            videos = videos.filter(video => {
                const searchable = [
                    video.username,
                    video.displayName,
                    video.caption,
                    video.music
                ].join(" ").toLowerCase();

                return searchable.includes(term);
            });
        }

        if (state.activeTab === "Trending") {
            videos.sort((a, b) => b.likes - a.likes);
        } else {
            videos.sort((a, b) => b.createdAt - a.createdAt);
        }

        return videos;
    }

    function revokeFeedObjectUrls() {
        $$(".feed-video[data-object-url]", feed).forEach(video => {
            safeRevokeObjectURL(video.dataset.objectUrl);
            delete video.dataset.objectUrl;
        });
    }

    function renderEmptyFeed() {
        if (!feed) return;

        feed.replaceChildren();

        const empty = document.createElement("div");
        empty.className = "empty-feed";
        empty.innerHTML = `
            <div class="empty-feed-icon">🎬</div>
            <h2>No videos here yet</h2>
            <p>Try another section or create your first video.</p>
            <button type="button" class="empty-create-btn" data-action="open-create">
                Create a video
            </button>
        `;

        feed.appendChild(empty);
    }

    function renderFeed() {
        if (!feed) {
            console.error('V-Tik: Missing <main id="feed"> in index.html.');
            return;
        }

        const videos = getVisibleVideos();

        if (window.vtikVideoObserver) {
            window.vtikVideoObserver.disconnect();
        }

        revokeFeedObjectUrls();

        if (!videos.length) {
            renderEmptyFeed();
            updateProfileButton();
            updateSearchClearButton();
            return;
        }

        feed.innerHTML = videos.map(videoCardHTML).join("");

        updateProfileButton();
        updateSearchClearButton();
        setupVideoPlayback();
        loadFeedVideoSources();
    }

    async function loadFeedVideoSources() {
        const elements = $$(".feed-video", feed);

        for (const element of elements) {
            const video = getVideo(element.dataset.videoId);
            if (!video) continue;

            let source = "";

            try {
                source = await resolveVideoSource(video);
            } catch (error) {
                console.warn("V-Tik: Could not load video source.", error);
            }

            if (!element.isConnected) {
                safeRevokeObjectURL(source);
                continue;
            }

            if (!source) {
                element.removeAttribute("src");
                element.load();

                const stage = element.closest(".video-stage");
                stage?.classList.remove("is-loading");
                stage?.classList.add("video-unavailable");

                if (stage && !$(".video-unavailable-message", stage)) {
                    const notice = document.createElement("div");
                    notice.className = "video-unavailable-message";
                    notice.textContent = "Video file is unavailable";
                    stage.appendChild(notice);
                }

                continue;
            }

            element.src = source;
            element.dataset.loaded = "true";

            if (source.startsWith("blob:")) {
                element.dataset.objectUrl = source;
            }

            element.load();
        }
    }

    function setupVideoPlayback() {
        const videos = $$(".feed-video", feed);

        if (window.vtikVideoObserver) {
            window.vtikVideoObserver.disconnect();
        }

        if (!("IntersectionObserver" in window)) {
            videos.forEach(video => {
                video.muted = true;
            });
            return;
        }

        window.vtikVideoObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const video = entry.target;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    $$(".feed-video", feed).forEach(other => {
                        if (other !== video) other.pause();
                    });

                    const playResult = video.play();
                    if (playResult?.catch) {
                        playResult.catch(() => {});
                    }
                } else {
                    video.pause();
                }
            });
        }, {
            threshold: [0, 0.6, 1]
        });

        videos.forEach(video => {
            video.muted = true;
            window.vtikVideoObserver.observe(video);
        });
    }

    /* 8. PROFILE */

    function updateProfileButton() {
        const avatar = getAvatar();
        const profileButton = byId("profileButton") || $(".profile-button");
        const mobileProfile = byId("mobileProfile");

        [profileButton, mobileProfile].forEach(button => {
            if (!button) return;

            const avatarElement = $(".avatar", button);

            if (avatarElement) {
                avatarElement.textContent = avatar;
            }
        });
    }

    /* 9. LIKES, SAVES, FOLLOWS */

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

        showToast(video.saved ? "Video saved ⭐" : "Video removed from saved");
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

    /* 10. COMMENTS */

    function renderComments(video) {
        const list = byId("comments") ||
            byId("commentsList") ||
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
                <div class="avatar small">${escapeHTML(comment.avatar || "🙂")}</div>
                <div class="comment-content">
                    <strong>@${escapeHTML(comment.username || "user")}</strong>
                    <p>${escapeHTML(comment.text || "")}</p>
                </div>
            </div>
        `).join("");
    }

    function openComments(id) {
        const video = getVideo(id);
        if (!video) return;

        if (!commentsModal) {
            showToast("Comments window is missing from index.html.");
            return;
        }

        activeVideoId = id;

        const title = byId("commentsTitle");
        if (title) title.textContent = `Comments · @${video.username}`;

        commentsModal.dataset.videoId = id;
        renderComments(video);
        showModal(commentsModal);

        const input = byId("commentInput");
        input?.focus();
    }

    function addComment(id, text) {
        const video = getVideo(id);
        const commentText = safeText(text);

        if (!video || !commentText) return;

        video.comments.push({
            id: makeId(),
            username: state.username || currentUser.username,
            avatar: getAvatar(),
            text: commentText,
            createdAt: Date.now()
        });

        saveState();
        renderFeed();
        openComments(id);
        showToast("Comment added 💬");
    }

    function bindComments() {
        const form = byId("commentForm");
        const input = byId("commentInput");

        if (!form || form.dataset.vtikBound) return;

        form.dataset.vtikBound = "true";

        form.addEventListener("submit", event => {
            event.preventDefault();

            const text = input?.value.trim() || "";
            if (!text || !activeVideoId) return;

            addComment(activeVideoId, text);

            if (input) input.value = "";
        });

        input?.addEventListener("input", () => {
            const button = byId("postCommentBtn");
            if (button) button.disabled = !input.value.trim();
        });
    }

    /* 11. SHARE */

    async function shareVideo(id) {
        const video = getVideo(id);
        if (!video) return;

        const url =
            `${location.href.split("#")[0]}#video-${encodeURIComponent(id)}`;

        const data = {
            title: `V-Tik video by @${video.username}`,
            text: video.caption || "Watch this video on V-Tik!",
            url
        };

        try {
            if (navigator.share) {
                await navigator.share(data);
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(
                    `${data.text}\n${data.url}`
                );
                showToast("Video link copied!");
            } else {
                window.prompt("Copy this video link:", url);
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.warn("V-Tik: Sharing failed.", error);
                showToast("Could not share this video.");
            }
        }
    }

    /* 12. MODALS */

    function showModal(modal) {
        if (!modal) return;

        modal.hidden = false;
        modal.classList.add("open", "active");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
    }

    function hideModal(modal) {
        if (!modal) return;

        modal.classList.remove("open", "active");
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");

        const stillOpen = $$(".modal.open, .modal.active, .viewer.open, .viewer.active")
            .some(item => !item.hidden);

        if (!stillOpen) {
            document.body.classList.remove("modal-open");
        }
    }

    function openCreateModal() {
        if (!createModal) {
            showToast("Create modal is missing from index.html.");
            return;
        }

        showModal(createModal);
    }

    /* 13. VIDEO UPLOAD AND PREVIEW */

    function getUploadElements() {
        return {
            input: videoPicker,
            caption: videoCaption,
            submit: postVideo
        };
    }

    function clearPreview() {
        if (uploadPreview) {
            uploadPreview.pause();
            uploadPreview.removeAttribute("src");
            uploadPreview.load();
        }

        safeRevokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;

        if (previewContainer) {
            previewContainer.classList.remove("has-preview");
            previewContainer.hidden = true;
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

        if (!file.type.startsWith("video/")) {
            showToast("Please select a valid video file.");
            if (videoPicker) videoPicker.value = "";
            return;
        }

        const maxSize = 250 * 1024 * 1024;

        if (file.size > maxSize) {
            showToast("Please choose a video smaller than 250 MB.");
            if (videoPicker) videoPicker.value = "";
            return;
        }

        previewObjectUrl = URL.createObjectURL(file);

        if (uploadPreview) {
            uploadPreview.src = previewObjectUrl;
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

    async function uploadVideo() {
        const { input, caption, submit } = getUploadElements();
        const file = input?.files?.[0];

        if (!file) {
            showToast("Choose a video before publishing.");
            return;
        }

        if (!file.type.startsWith("video/")) {
            showToast("Choose a valid video file.");
            return;
        }

        if (file.size > 250 * 1024 * 1024) {
            showToast("Please choose a video smaller than 250 MB.");
            return;
        }

        if (submit) {
            submit.disabled = true;
            submit.dataset.originalText = submit.textContent;
            submit.textContent = "Publishing...";
        }

        const creatorName = safeText(
            state.username,
            currentUser.username
        );

        const video = {
            id: makeId(),
            username: creatorName.replace(/^@/, "").replace(/\s+/g, "_"),
            displayName: creatorName,
            avatar: getAvatar(),
            caption: safeText(caption?.value, ""),
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
            await saveVideoFile(video.id, file);

            state.videos.unshift(video);
            state.activeTab = "For You";
            state.currentSection = "home";
            searchTerm = "";

            if (searchInput) searchInput.value = "";

            saveState();
            updateNavigation("home");
            renderFeed();

            if (input) input.value = "";
            if (caption) caption.value = "";

            clearPreview();
            hideModal(createModal);

            showToast("Video published successfully! 🎉");
        } catch (error) {
            console.error("V-Tik: Upload failed.", error);
            showToast("Upload failed. Check browser storage and try again.");
        } finally {
            if (submit) {
                submit.textContent =
                    submit.dataset.originalText || "Post Video";

                delete submit.dataset.originalText;

                submit.disabled = !input?.files?.length;
            }
        }
    }

    function bindUploadControls() {
        const { input, submit } = getUploadElements();

        if (input && !input.dataset.vtikBound) {
            input.dataset.vtikBound = "true";

            input.addEventListener("change", () => {
                previewSelectedVideo(input.files?.[0]);
            });
        }

        if (uploadZone && !uploadZone.dataset.vtikBound) {
            uploadZone.dataset.vtikBound = "true";

            uploadZone.addEventListener("click", event => {
                if (event.target.closest("button, input, video, label")) return;
                input?.click();
            });

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
                    showToast("Drop a video file to upload.");
                    return;
                }

                if (file.size > 250 * 1024 * 1024) {
                    showToast("Please choose a video smaller than 250 MB.");
                    return;
                }

                if (input) {
                    try {
                        const transfer = new DataTransfer();
                        transfer.items.add(file);
                        input.files = transfer.files;
                    } catch (error) {
                        console.warn("V-Tik: Could not attach dropped file.", error);
                    }
                }

                previewSelectedVideo(file);
            });
        }

        if (submit && !submit.dataset.vtikBound) {
            submit.dataset.vtikBound = "true";

            submit.addEventListener("click", event => {
                event.preventDefault();
                uploadVideo();
            });
        }
    }

    /* 14. FULLSCREEN VIEWER */

    async function openViewer(id) {
        const video = getVideo(id);
        if (!video) return;

        if (!viewer) {
            showToast("Fullscreen viewer is missing from index.html.");
            return;
        }

        const viewerVideo = byId("viewerVideo") || $("video", viewer);

        if (!viewerVideo) {
            showToast("Add a video element to the fullscreen viewer.");
            return;
        }

        safeRevokeObjectURL(viewerObjectUrl);
        viewerObjectUrl = null;

        let source = "";

        try {
            source = await resolveVideoSource(video);
        } catch (error) {
            console.warn("V-Tik: Could not open viewer.", error);
        }

        if (!source) {
            showToast("This video file is unavailable.");
            return;
        }

        if (source.startsWith("blob:")) {
            viewerObjectUrl = source;
        }

        viewerVideo.src = source;
        viewerVideo.loop = true;
        viewerVideo.playsInline = true;
        viewerVideo.muted = false;

        showModal(viewer);

        try {
            await viewerVideo.play();
        } catch (_) {
            // The viewer remains available for manual playback.
        }
    }

    function closeViewer() {
        if (!viewer) return;

        const viewerVideo = byId("viewerVideo") || $("video", viewer);

        if (viewerVideo) {
            viewerVideo.pause();
            viewerVideo.removeAttribute("src");
            viewerVideo.load();
        }

        safeRevokeObjectURL(viewerObjectUrl);
        viewerObjectUrl = null;

        hideModal(viewer);
    }

    /* 15. NAVIGATION */

    const sectionMap = {
        home: "For You",
        discover: "For You",
        following: "Following",
        liked: "Liked",
        saved: "Saved",
        messages: "For You",
        trending: "Trending",
        music: "For You",
        gaming: "For You",
        challenges: "For You"
    };

    function updateNavigation(section) {
        $$("[data-section]").forEach(button => {
            const active = button.dataset.section === section;

            button.classList.toggle("active", active);

            if (active) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });
    }

    function setActiveTab(section) {
        if (!Object.prototype.hasOwnProperty.call(sectionMap, section)) {
            section = "home";
        }

        state.currentSection = section;
        state.activeTab = sectionMap[section];

        updateNavigation(section);
        saveState();

        if (section === "messages") {
            showToast("Messages will be available when messaging is connected.");
        } else if (["music", "gaming", "challenges"].includes(section)) {
            const labels = {
                music: "Music",
                gaming: "Gaming",
                challenges: "Challenges"
            };

            showToast(`${labels[section]} videos are coming soon.`);
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

    /* 16. SEARCH */

    function updateSearchClearButton() {
        if (!clearSearchButton) return;

        clearSearchButton.hidden = !(searchInput?.value || "").length;
    }

    function bindSearch() {
        if (!searchInput || searchInput.dataset.vtikBound) return;

        searchInput.dataset.vtikBound = "true";

        searchInput.addEventListener("input", () => {
            searchTerm = searchInput.value.trim();
            updateSearchClearButton();
            renderFeed();
        });

        clearSearchButton?.addEventListener("click", () => {
            searchInput.value = "";
            searchTerm = "";
            updateSearchClearButton();
            renderFeed();
            searchInput.focus();
        });

        searchInput.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                searchInput.value = "";
                searchTerm = "";
                updateSearchClearButton();
                renderFeed();
            }
        });

        updateSearchClearButton();
    }

    /* 17. FEED ACTIONS */

    function bindFeedActions() {
        if (!feed || feed.dataset.vtikActionsBound) return;

        feed.dataset.vtikActionsBound = "true";

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
                const card = button.closest("[data-video-id]");
                const videoElement = $(".feed-video", card);

                if (videoElement) {
                    videoElement.muted = !videoElement.muted;
                    button.textContent = videoElement.muted ? "🔇" : "🔊";
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

    /* 18. MODAL BUTTONS AND KEYBOARD */

    function bindModalControls() {
        ["createTop", "mobileCreate"].forEach(id => {
            const button = byId(id);
            if (!button || button.dataset.vtikBound) return;

            button.dataset.vtikBound = "true";

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

        byId("createBackdrop")?.addEventListener("click", () => {
            hideModal(createModal);
        });

        byId("commentsBackdrop")?.addEventListener("click", () => {
            hideModal(commentsModal);
        });

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

        byId("mobileCreate")?.setAttribute("aria-label", "Create a video");
    }

    /* 19. VIDEO LOADING AND ERROR EVENTS */

    function bindVideoEvents() {
        if (!feed || feed.dataset.vtikVideoEventsBound) return;

        feed.dataset.vtikVideoEventsBound = "true";

        feed.addEventListener("loadstart", event => {
            const video = event.target.closest?.(".feed-video");
            video?.closest(".video-stage")?.classList.add("is-loading");
        }, true);

        feed.addEventListener("loadeddata", event => {
            const video = event.target.closest?.(".feed-video");
            const stage = video?.closest(".video-stage");

            stage?.classList.remove(
                "is-loading",
                "video-unavailable"
            );

            $(".video-unavailable-message", stage)?.remove();
        }, true);

        feed.addEventListener("error", event => {
            const video = event.target.closest?.(".feed-video");
            if (!video) return;

            const stage = video.closest(".video-stage");
            stage?.classList.remove("is-loading");
            stage?.classList.add("video-unavailable");
        }, true);
    }

    /* 20. STARTUP */

    function initializeVtik() {
        bindNavigation();
        bindSearch();
        bindFeedActions();
        bindModalControls();
        bindUploadControls();
        bindComments();
        bindVideoEvents();

        /*
         * Close all dialogs at startup.
         * They open only when a user clicks the appropriate button.
         */
        [createModal, commentsModal, viewer].forEach(modal => {
            if (!modal) return;

            modal.classList.remove("active", "open");
            modal.hidden = true;
            modal.setAttribute("aria-hidden", "true");
        });

        document.body.classList.remove("modal-open");

        updateNavigation(state.currentSection || "home");
        updateProfileButton();
        updateSearchClearButton();

        // Render saved videos or sample cards.
        renderFeed();

        console.info("V-Tik is ready.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeVtik, {
            once: true
        });
    } else {
        initializeVtik();
    }
})();
