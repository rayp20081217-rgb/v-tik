/* ==================================================
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
