
"use strict";

/* =========================================================
   V-TIK — COMPLETE APPLICATION
   Feed, autoplay, search, navigation, comments, uploads,
   likes, saves, following, sharing and fullscreen viewing.
========================================================= */

/* ========================= DOM HELPERS ================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const videoList = $("#videoList");
const searchInput = $("#searchInput");
const clearSearch = $("#clearSearch");
const emptyFeed = $("#emptyFeed");

const commentsModal = $("#commentsModal");
const commentsList = $("#commentsList");
const commentForm = $("#commentForm");
const commentInput = $("#commentInput");

const createModal = $("#createModal");
const videoPicker = $("#videoPicker");
const uploadPreview = $("#uploadPreview");
const previewContainer = $("#previewContainer");
const uploadName = $("#uploadName");
const videoCaption = $("#videoCaption");
const postVideoButton = $("#postVideo");

const toast = $("#toast");
const videoViewer = $("#videoViewer");
const viewerVideo = $("#viewerVideo");

/* ========================= APPLICATION STATE ============= */

let activeVideoId = null;
let currentSection = "home";
let currentCommentVideoId = null;

let autoplayObserver = null;
let toastTimer = null;
let previewURL = null;

const uploadObjectURLs = new Set();
const playbackListeners = new WeakSet();

/* ========================= VIDEO DATABASE ================ */

/*
  Every ID is unique.
  File paths must match the actual filenames in your project.
  Likes, comments and saves currently remain in browser memory.
*/

const videos = [
    {
        id: "video-1",
        src: "./fik logogo.mp4",
        username: "f1creator",
        caption: "Ranking the best F1 donuts! 🏎️🔥 #F1 #Formula1 #Motorsport",
        likes: 1250,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "gaming"
    },
    {
        id: "video-2",
        src: "./fik ft spice diana.mp4",
        username: "musiccreator",
        caption: "Enjoy the music! 🎵 #Music",
        likes: 842,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "music"
    },
    {
        id: "video-3",
        src: "./football.mp4",
        username: "footballfan",
        caption: "Football moments you need to see! ⚽🔥",
        likes: 450,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    },
    {
        id: "video-4",
        src: "./Ranking Best F1 Donut's!.mp4",
        username: "f1creator",
        caption: "The best Formula One donuts! 🏎️ #F1 #Motorsport",
        likes: 1250,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "gaming"
    },
    {
        id: "video-5",
        src: "./Download.mp4",
        username: "videoexplorer",
        caption: "Watch this amazing moment! ✨",
        likes: 320,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    },
    {
        id: "video-6",
        src: "./video2.mp4",
        username: "daily_moments",
        caption: "Watch this moment! ✨ What do you think?",
        likes: 842,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    },
    {
        id: "video-7",
        src: "./videoplayback.mp4",
        username: "trending_videos",
        caption: "Another video to enjoy 🎬 #Vtik",
        likes: 2360,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    },
    {
        id: "video-8",
        src: "./video2 (1).mp4",
        username: "yourname",
        caption: "Check out my new video!",
        likes: 0,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    },
    {
        id: "video-9",
        src: "./dance.mp4",
        username: "dancecreator",
        caption: "Time to dance! 💃🔥 #Dance",
        likes: 1250,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "music"
    },
    {
        id: "video-10",
        src: "./cb.mp4",
        username: "cbtalker",
        caption: "Watch this moment! ✨ What do you think?",
        likes: 842,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    },
    {
        id: "video-11",
        src: "./v3.mp4",
        username: "yourname",
        caption: "Check out my new video! 🎬",
        likes: 0,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "gaming"
    },
    {
        id: "video-12",
        src: "./school vybz.mp4",
        username: "schoolvybz",
        caption: "School vibes! 🎒🔥",
        likes: 0,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    },
    {
        id: "video-13",
        src: "./masape.mp4",
        username: "masape",
        caption: "Enjoy this video! 🎬🔥",
        likes: 1250,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "gaming"
    }
];

/* ========================= GENERAL HELPERS =============== */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function initials(username) {
    return (String(username || "VT").trim().slice(0, 2) || "VT")
        .toUpperCase();
}

function formatCount(number) {
    const count = Number(number) || 0;

    if (count >= 1_000_000) {
        return (count / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    }

    if (count >= 1_000) {
        return (count / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    }

    return String(count);
}

function showToast(message) {
    if (!toast) {
        console.info("[V-Tik]", message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function getVideo(id) {
    return videos.find(video => String(video.id) === String(id));
}

function getVideoURL(video) {
    return new URL(video.src, document.baseURI).href;
}

function isValidVideoFile(file) {
    return Boolean(
        file &&
        (
            file.type.startsWith("video/") ||
            /\.(mp4|webm|ogg|mov|m4v)$/i.test(file.name)
        )
    );
}

/* ========================= NAVIGATION FILTERS ============ */

const sectionTitles = {
    home: "For You",
    discover: "Discover",
    following: "Following",
    liked: "Liked videos",
    saved: "Saved videos",
    trending: "Trending",
    music: "Music",
    gaming: "Gaming",
    challenges: "Challenges",
    messages: "Messages"
};

function matchesSection(video) {
    switch (currentSection) {
        case "following":
            return video.following;

        case "liked":
            return video.liked;

        case "saved":
            return video.saved;

        case "trending":
            return video.category === "trending";

        case "music":
            return video.category === "music";

        case "gaming":
            return video.category === "gaming";

        case "challenges":
            return /challenge/i.test(
                `${video.caption} ${video.category}`
            );

        case "home":
        case "discover":
        case "messages":
        default:
            return true;
    }
}

function getVisibleVideos() {
    const query = (searchInput?.value || "").trim().toLowerCase();

    return videos.filter(video => {
        const searchable = [
            video.username,
            video.caption,
            video.src,
            video.category
        ].join(" ").toLowerCase();

        return matchesSection(video) &&
            (!query || searchable.includes(query));
    });
}

/* ========================= VIDEO CARD TEMPLATE =========== */

function createVideoCard(video) {
    return `
        <article class="video-card"
                 data-video-id="${escapeHTML(video.id)}">

            <div class="video-card-main">

                <div class="video-stage">

                    <video
                        class="feed-video"
                        src="${escapeHTML(video.src)}"
                        muted
                        loop
                        playsinline
                        preload="metadata"
                        controls
                        aria-label="Video by ${escapeHTML(video.username)}"
                    >
                        Your browser does not support HTML video.
                    </video>

                    <div class="video-load-error" role="status" hidden>
                        <strong>Video unavailable</strong>
                        <p>Check the file path, format or deployment.</p>
                    </div>

                    <button
                        class="video-play-overlay"
                        type="button"
                        data-action="toggle-play"
                        data-id="${escapeHTML(video.id)}"
                        aria-label="Play or pause video"
                    >▶</button>

                </div>

                <div class="video-info">

                    <div class="video-details">

                        <div class="creator-avatar">
                            ${escapeHTML(initials(video.username))}
                        </div>

                        <div class="creator-meta">
                            <strong>@${escapeHTML(video.username)}</strong>
                            <span>V-Tik creator</span>
                        </div>

                        <button
                            class="follow-btn"
                            type="button"
                            data-action="follow"
                            data-id="${escapeHTML(video.id)}"
                            aria-pressed="${video.following}"
                        >${video.following ? "Following" : "Follow"}</button>

                    </div>

                    <p class="video-caption">
                        ${escapeHTML(video.caption)}
                    </p>

                </div>

            </div>

            <div class="video-actions">

                <button
                    class="like-action ${video.liked ? "active" : ""}"
                    type="button"
                    data-action="like"
                    data-id="${escapeHTML(video.id)}"
                    aria-label="${video.liked ? "Unlike" : "Like"} video"
                    aria-pressed="${video.liked}"
                >
                    <span>${video.liked ? "♥" : "♡"}</span>
                    <small>${formatCount(video.likes)}</small>
                </button>

                <button
                    type="button"
                    data-action="comments"
                    data-id="${escapeHTML(video.id)}"
                    aria-label="Open comments"
                >
                    <span>☰</span>
                    <small>${formatCount(video.comments.length)}</small>
                </button>

                <button
                    class="${video.saved ? "active" : ""}"
                    type="button"
                    data-action="save"
                    data-id="${escapeHTML(video.id)}"
                    aria-label="${video.saved ? "Unsave" : "Save"} video"
                    aria-pressed="${video.saved}"
                >
                    <span>${video.saved ? "▣" : "▤"}</span>
                    <small>${video.saved ? "Saved" : "Save"}</small>
                </button>

                <button
                    type="button"
                    data-action="share"
                    data-id="${escapeHTML(video.id)}"
                    aria-label="Share video"
                >
                    <span>↗</span>
                    <small>Share</small>
                </button>

            </div>
        </article>
    `;
}

/* ========================= FEED RENDERING ================= */

function renderFeed() {
    if (!videoList) {
        console.error('V-Tik: The "#videoList" element is missing.');
        return;
    }

    if (autoplayObserver) {
        autoplayObserver.disconnect();
        autoplayObserver = null;
    }

    const visibleVideos = getVisibleVideos();

    videoList.innerHTML = visibleVideos.map(createVideoCard).join("");

    if (emptyFeed) {
        emptyFeed.hidden = visibleVideos.length !== 0;
    }

    if (visibleVideos.length === 0) {
        activeVideoId = null;
        return;
    }

    setupAutoplay();
}

/* ========================= VIDEO ERROR HANDLING =========== */

function showVideoError(player) {
    const stage = player.closest(".video-stage");
    const message = $(".video-load-error", stage);

    if (message) message.hidden = false;

    player.closest(".video-card")?.classList.add("video-error");

    console.error("[V-Tik] Video failed:", {
        source: player.currentSrc || player.src,
        code: player.error?.code || null,
        message: player.error?.message || "Unknown loading error"
    });
}

function clearVideoError(player) {
    const stage = player.closest(".video-stage");
    const message = $(".video-load-error", stage);

    if (message) message.hidden = true;

    player.closest(".video-card")?.classList.remove("video-error");
}

function pauseOtherVideos(currentPlayer) {
    $$(".feed-video", videoList).forEach(player => {
        if (player !== currentPlayer && !player.paused) {
            player.pause();
        }
    });
}

/* ========================= AUTOPLAY ======================= */

function setupAutoplay() {
    if (!videoList) return;

    const players = $$(".feed-video", videoList);

    if (!players.length) return;

    players.forEach(player => {
        player.muted = true;
        player.defaultMuted = true;
        player.loop = true;
        player.playsInline = true;

        // Register listeners only once per video element.
        if (playbackListeners.has(player)) return;

        playbackListeners.add(player);

        player.addEventListener("error", () => {
            showVideoError(player);
        });

        player.addEventListener("loadeddata", () => {
            clearVideoError(player);
        });

        player.addEventListener("playing", () => {
            clearVideoError(player);
        });

        player.addEventListener("play", () => {
            pauseOtherVideos(player);

            const card = player.closest(".video-card");

            if (card) {
                activeVideoId = card.dataset.videoId;
                card.classList.remove("is-paused");
            }
        });

        player.addEventListener("pause", () => {
            player.closest(".video-card")?.classList.add("is-paused");
        });
    });

    if (!("IntersectionObserver" in window)) {
        players[0].play().catch(() => {});
        return;
    }

    autoplayObserver = new IntersectionObserver(entries => {
        const bestEntry = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
            .find(entry => entry.intersectionRatio >= 0.55);

        if (!bestEntry) return;

        const target = bestEntry.target;

        pauseOtherVideos(target);

        activeVideoId =
            target.closest(".video-card")?.dataset.videoId || null;

        target.muted = true;

        target.play().catch(error => {
            console.debug(
                "[V-Tik] Autoplay blocked; manual playback is available.",
                error.name
            );
        });
    }, {
        threshold: [0, 0.25, 0.4, 0.55, 0.7, 0.9, 1]
    });

    players.forEach(player => autoplayObserver.observe(player));
}

/* ========================= LIKE / SAVE / FOLLOW / SHARE === */

videoList?.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");

    if (!button || !videoList.contains(button)) return;

    const { action, id } = button.dataset;
    const video = getVideo(id);

    if (!video) return;

    switch (action) {
        case "like":
            video.liked = !video.liked;
            video.likes = Math.max(
                0,
                video.likes + (video.liked ? 1 : -1)
            );
            renderFeed();
            break;

        case "save":
            video.saved = !video.saved;
            renderFeed();
            showToast(video.saved ? "Video saved" : "Video removed from saved");
            break;

        case "follow":
            video.following = !video.following;
            renderFeed();
            showToast(video.following ? "Following creator" : "Unfollowed creator");
            break;

        case "comments":
            openComments(id);
            break;

        case "share":
            await shareVideo(video);
            break;

        case "toggle-play": {
            const player = $(".feed-video", button.closest(".video-card"));

            if (!player) break;

            if (player.paused) {
                player.muted = true;

                try {
                    await player.play();
                } catch {
                    showToast("Unable to play video. Check its file.");
                }
            } else {
                player.pause();
            }

            break;
        }
    }
});

/* ========================= COMMENTS ======================= */

function renderComments(video) {
    if (!commentsList) return;

    if (!video.comments.length) {
        commentsList.innerHTML = `
            <p class="file-name-muted">
                No comments yet. Be the first to comment!
            </p>
        `;
        return;
    }

    commentsList.innerHTML = video.comments.map(comment => `
        <div class="comment-item">
            <strong>@${escapeHTML(comment.username)}</strong>
            <p>${escapeHTML(comment.text)}</p>
        </div>
    `).join("");
}

function openComments(videoId) {
    const video = getVideo(videoId);

    if (!video || !commentsModal || !commentsList) {
        showToast("Comments are unavailable");
        return;
    }

    currentCommentVideoId = videoId;

    renderComments(video);

    commentsModal.classList.add("active");
    commentsModal.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");

    setTimeout(() => commentInput?.focus(), 50);
}

commentForm?.addEventListener("submit", event => {
    event.preventDefault();

    const text = commentInput?.value.trim();
    const video = getVideo(currentCommentVideoId);

    if (!text || !video) return;

    video.comments.push({
        username: "you",
        text
    });

    if (commentInput) commentInput.value = "";

    renderComments(video);
    renderFeed();
    openComments(video.id);
});

/* ========================= MODAL MANAGEMENT =============== */

function openModal(modal) {
    if (!modal) return;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");
}

function closeModal(modal) {
    if (!modal) return;

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");

    if (!$(".modal.active") && !$("#videoViewer.active")) {
        document.body.classList.remove("modal-open");
    }
}

$("#createTop")?.addEventListener("click", () => openModal(createModal));
$("#mobileCreate")?.addEventListener("click", () => openModal(createModal));

$$("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => {
        if (button.closest("#videoViewer")) {
            closeViewer();
        } else {
            closeModal(button.closest(".modal"));
        }
    });
});

$$(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
        if (event.target === modal) closeModal(modal);
    });
});

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    $$(".modal.active").forEach(closeModal);
    closeViewer();
});

/* ========================= SEARCH ========================= */

searchInput?.addEventListener("input", () => {
    if (clearSearch) clearSearch.hidden = !searchInput.value;
    renderFeed();
});

clearSearch?.addEventListener("click", () => {
    if (!searchInput) return;

    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.focus();
});

/* ========================= NAVIGATION ===================== */

function setSection(section) {
    currentSection = section;

    $$("[data-section]").forEach(button => {
        const active = button.dataset.section === section;

        button.classList.toggle("active", active);

        if (active) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

    renderFeed();

    const title = sectionTitles[section] || "V-Tik";

    document.title = `${title} — V-Tik`;

    const heading = $("#feedTitle") || $("#sectionTitle");

    if (heading) heading.textContent = title;
}

$$("[data-section]").forEach(button => {
    button.addEventListener("click", event => {
        event.preventDefault();

        const section = button.dataset.section;

        if (!section) return;

        setSection(section);

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });
});

/* ========================= SHARING ======================== */

async function shareVideo(video) {
    let url;

    try {
        url = getVideoURL(video);
    } catch {
        showToast("Invalid video URL");
        return;
    }

    const shareData = {
        title: "V-Tik video",
        text: video.caption,
        url
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            showToast("Video link copied");
        } else {
            window.prompt("Copy this video link:", url);
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("[V-Tik] Share error:", error);
            showToast("Could not share this video");
        }
    }
}

/* ========================= UPLOAD PREVIEW ================= */

videoPicker?.addEventListener("change", () => {
    const file = videoPicker.files?.[0];

    if (!file) return;

    if (!isValidVideoFile(file)) {
        showToast("Choose a supported video file");
        videoPicker.value = "";
        return;
    }

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
    }

    previewURL = URL.createObjectURL(file);

    if (uploadPreview) {
        uploadPreview.src = previewURL;
        uploadPreview.load();
    }

    if (previewContainer) previewContainer.hidden = false;
    if (uploadName) uploadName.textContent = file.name;
    if (postVideoButton) postVideoButton.disabled = false;
});

/* ========================= POST UPLOAD ==================== */

postVideoButton?.addEventListener("click", () => {
    const file = videoPicker?.files?.[0];

    if (!file || !isValidVideoFile(file)) {
        showToast("Choose a valid video first");
        return;
    }

    const src = URL.createObjectURL(file);

    uploadObjectURLs.add(src);

    videos.unshift({
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        src,
        username: "you",
        caption: videoCaption?.value.trim() || file.name,
        likes: 0,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    });

    if (videoPicker) videoPicker.value = "";
    if (videoCaption) videoCaption.value = "";
    if (postVideoButton) postVideoButton.disabled = true;

    if (uploadPreview) {
        uploadPreview.pause();
        uploadPreview.removeAttribute("src");
        uploadPreview.load();
    }

    if (previewContainer) previewContainer.hidden = true;
    if (uploadName) uploadName.textContent = "";

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
    }

    closeModal(createModal);
    setSection("home");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    showToast("Video added to your feed");
});

/* ========================= FULLSCREEN VIEWER ============== */

function openViewer(src) {
    if (!videoViewer || !viewerVideo) return;

    viewerVideo.src = src;
    viewerVideo.muted = true;

    videoViewer.classList.add("active");
    videoViewer.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");

    viewerVideo.play().catch(() => {});
}

function closeViewer() {
    if (!videoViewer) return;

    videoViewer.classList.remove("active");
    videoViewer.setAttribute("aria-hidden", "true");

    if (viewerVideo) {
        viewerVideo.pause();
        viewerVideo.removeAttribute("src");
        viewerVideo.load();
    }

    if (!$(".modal.active")) {
        document.body.classList.remove("modal-open");
    }
}

$("#viewerClose")?.addEventListener("click", closeViewer);

/* ========================= NEXT / PREVIOUS VIDEO ========== */

function scrollToVideo(direction) {
    const cards = $$("#videoList .video-card");

    if (!cards.length) return;

    const center = window.innerHeight / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;

    cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - center);

        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    const nextIndex = Math.max(
        0,
        Math.min(cards.length - 1, closestIndex + direction)
    );

    cards[nextIndex].scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

$("#scrollUp")?.addEventListener("click", () => scrollToVideo(-1));
$("#scrollDown")?.addEventListener("click", () => scrollToVideo(1));

/* ========================= DIAGNOSTICS ==================== */

function checkVideos() {
    const players = $$(".feed-video", videoList || document);

    console.table(players.map(player => ({
        source: player.currentSrc || player.src,
        readyState: player.readyState,
        networkState: player.networkState,
        errorCode: player.error?.code || 0,
        errorMessage: player.error?.message || ""
    })));

    return players.length;
}

window.VTik = window.VTik || {};

window.VTik.renderFeed = renderFeed;
window.VTik.refreshAutoplay = setupAutoplay;
window.VTik.openViewer = openViewer;
window.VTik.closeViewer = closeViewer;
window.VTik.checkVideos = checkVideos;
window.VTik.getVideos = () => videos;

/* ========================= CLEANUP ======================== */

window.addEventListener("beforeunload", () => {
    autoplayObserver?.disconnect();

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
    }

    uploadObjectURLs.forEach(url => URL.revokeObjectURL(url));
    uploadObjectURLs.clear();
});

/* ========================= INITIALIZE ===================== */

if (videoList) {
    renderFeed();
} else {
    console.error('V-Tik initialization failed: "#videoList" not found.');
}

if (clearSearch && searchInput) {
    clearSearch.hidden = !searchInput.value;
}

console.info("[V-Tik] Application initialized.");
