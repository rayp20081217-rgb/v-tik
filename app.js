
"use strict";

/* =========================================
   V-TIK APP
   Videos, autoplay, interactions and uploads
========================================= */

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

/* =========================================
   VIDEO DATA
========================================= */

const videos = [
    {
        id: "video-1",
        src: "./Ranking Best F1 Donut's!.mp4",
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
        id: "video-1",
        src: "./Download.mp4",
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
        id: "video-3",
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
  id: 4,
  src: "./video2 (1).mp4",
  username: "yourname",
  caption: "Check out my new video!",
  category: "trending",
  likes: 0,
  comments: [],
  saved: false,
  following: false
},{
        id: "video-1",
        src: "./dance.mp4",
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
        src: "./cb.mp4",
        username: "cb talker",
        caption: "Watch this moment! ✨ What do you think?",
        likes: 842,
        comments: [],
        liked: false,
        saved: false,
        following: false,
        category: "trending"
    },
      {
  id: 4,
  src: "./v3.mp4",
  username: "yourname",
  caption: "Check out my new video!",
  category: "trending",
  likes: 0,
  comments: [],
  saved: false,
  following: false
},
       {
  id: 4,
  src: "./school vybz.mp4",
  username: "yourname",
  caption: "Check out my new video!",
  category: "trending",
  likes: 0,
  comments: [],
  saved: false,
  following: false
}
];

let activeVideoId = null;
let currentSection = "home";
let currentCommentVideoId = null;
let autoplayObserver = null;
let toastTimer = null;
let previewURL = null;
let uploadObjectURLs = [];
let currentViewerURL = null;

/* =========================================
   HELPERS
========================================= */

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function initials(username) {
    return username.slice(0, 2).toUpperCase();
}

function formatCount(number) {
    if (number >= 1_000_000) {
        return (number / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    }

    if (number >= 1_000) {
        return (number / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    }

    return String(number);
}

function showToast(message) {
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2300);
}

function getVideo(id) {
    return videos.find(video => video.id === id);
}

/* =========================================
   RENDER VIDEO CARDS
========================================= */

function renderFeed() {
    if (!videoList) return;

    const query = (searchInput?.value || "").trim().toLowerCase();

    const visibleVideos = videos.filter(video => {
        const matchesSearch =
            !query ||
            video.username.toLowerCase().includes(query) ||
            video.caption.toLowerCase().includes(query) ||
            video.src.toLowerCase().includes(query);

        let matchesSection = true;

        if (currentSection === "following") {
            matchesSection = video.following;
        } else if (currentSection === "liked") {
            matchesSection = video.liked;
        } else if (currentSection === "saved") {
            matchesSection = video.saved;
        } else if (currentSection === "gaming") {
            matchesSection = video.category === "gaming";
        } else if (currentSection === "music") {
            matchesSection = video.category === "music";
        }

        return matchesSearch && matchesSection;
    });

    videoList.innerHTML = visibleVideos.map(video => `
        <article class="video-card" data-video-id="${escapeHTML(video.id)}">
            <div class="video-card-main">
                <div class="video-stage">
                    <video
                        class="feed-video"
                        src="${escapeHTML(video.src)}"
                        muted
                        autoplay
                        loop
                        playsinline
                        preload="metadata"
                        controls
                        aria-label="Video by ${escapeHTML(video.username)}"
                    ></video>

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
                        >${video.following ? "Following" : "Follow"}</button>
                    </div>

                    <p class="video-caption">${escapeHTML(video.caption)}</p>
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
    `).join("");

    if (emptyFeed) {
        emptyFeed.hidden = visibleVideos.length > 0;
    }

    setupAutoplay();
}

/* =========================================
   AUTOPLAY
   Play the most visible video.
   Pause videos outside the viewport.
========================================= */

function setupAutoplay() {
    if (!videoList) return;

    if (autoplayObserver) {
        autoplayObserver.disconnect();
    }

    const feedVideos = $$(".feed-video", videoList);

    if (!feedVideos.length) return;

    autoplayObserver = new IntersectionObserver(entries => {
        const visibleEntries = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        const bestEntry = visibleEntries.find(
            entry => entry.intersectionRatio >= 0.55
        );

        const targetVideo = bestEntry?.target || null;

        feedVideos.forEach(video => {
            if (video !== targetVideo && !video.paused) {
                video.pause();
            }
        });

        if (targetVideo) {
            activeVideoId = targetVideo.closest(".video-card")?.dataset.videoId || null;

            // Muted autoplay is supported by most modern browsers.
            targetVideo.muted = true;

            const playPromise = targetVideo.play();

            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => {
                    // The viewer can start playback manually if blocked.
                });
            }
        }
    }, {
        threshold: [0, 0.25, 0.4, 0.55, 0.7, 0.9, 1]
    });

    feedVideos.forEach(video => {
        video.muted = true;
        video.defaultMuted = true;
        video.autoplay = true;
        video.loop = true;
        video.playsInline = true;

        autoplayObserver.observe(video);

        video.addEventListener("play", () => {
            feedVideos.forEach(other => {
                if (other !== video) other.pause();
            });

            const card = video.closest(".video-card");
            if (card) {
                activeVideoId = card.dataset.videoId;
                card.classList.remove("is-paused");
            }
        });

        video.addEventListener("pause", () => {
            video.closest(".video-card")?.classList.add("is-paused");
        });

        video.addEventListener("ended", () => {
            video.closest(".video-card")?.classList.add("is-paused");
        });

        video.addEventListener("error", () => {
            console.warn("Could not load video:", video.currentSrc || video.src);
        }, { once: true });
    });
}

function refreshAutoplay() {
    setupAutoplay();
}

window.VTik = window.VTik || {};
window.VTik.refreshAutoplay = refreshAutoplay;

/* =========================================
   VIDEO ACTIONS
========================================= */

videoList?.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

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
            const card = button.closest(".video-card");
            const player = $(".feed-video", card);

            if (!player) break;

            if (player.paused) {
                player.muted = true;
                player.play().catch(() => {});
            } else {
                player.pause();
            }
            break;
        }
    }
});

/* =========================================
   COMMENTS
========================================= */

function openComments(videoId) {
    const video = getVideo(videoId);
    if (!video || !commentsModal || !commentsList) return;

    currentCommentVideoId = videoId;
    renderComments(video);

    commentsModal.classList.add("active");
    commentsModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    setTimeout(() => commentInput?.focus(), 50);
}

function renderComments(video) {
    if (!commentsList) return;

    if (!video.comments.length) {
        commentsList.innerHTML =
            '<p class="file-name-muted">No comments yet. Be the first to comment!</p>';
        return;
    }

    commentsList.innerHTML = video.comments.map(comment => `
        <div class="comment-item">
            <strong>@${escapeHTML(comment.username)}</strong>
            <p>${escapeHTML(comment.text)}</p>
        </div>
    `).join("");
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

    // Keep the current comments open after rerendering the feed.
    openComments(video.id);
});

/* =========================================
   MODALS
========================================= */

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
        closeModal(button.closest(".modal"));

        if (button.closest("#videoViewer")) {
            closeViewer();
        }
    });
});

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    $$(".modal.active").forEach(closeModal);
    closeViewer();
});

/* =========================================
   SEARCH
========================================= */

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

/* =========================================
   NAVIGATION
========================================= */

function setSection(section) {
    currentSection = section;

    $$(".nav-item[data-section], .mobile-nav [data-section]").forEach(button => {
        button.classList.toggle("active", button.dataset.section === section);
    });

    renderFeed();

    const titleMap = {
        home: "V-Tik",
        discover: "Discover",
        following: "Following",
        liked: "Liked videos",
        saved: "Saved videos",
        trending: "Trending",
        music: "Music",
        gaming: "Gaming"
    };

    document.title = `${titleMap[section] || "V-Tik"} — V-Tik`;
}

$$("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
        setSection(button.dataset.section);
    });
});

/* =========================================
   SHARE
========================================= */

async function shareVideo(video) {
    const shareData = {
        title: "V-Tik video",
        text: video.caption,
        url: new URL(video.src, window.location.href).href
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareData.url);
            showToast("Video link copied");
        } else {
            showToast("Sharing is not supported in this browser");
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            showToast("Could not share this video");
        }
    }
}

/* =========================================
   UPLOAD AND PREVIEW
========================================= */

videoPicker?.addEventListener("change", () => {
    const file = videoPicker.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
        showToast("Please choose a video file");
        videoPicker.value = "";
        return;
    }

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
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

postVideoButton?.addEventListener("click", () => {
    const file = videoPicker?.files?.[0];

    if (!file) {
        showToast("Choose a video first");
        return;
    }

    if (!file.type.startsWith("video/")) {
        showToast("Please choose a valid video");
        return;
    }

    const src = URL.createObjectURL(file);
    uploadObjectURLs.push(src);

    const caption = videoCaption?.value.trim() || file.name;

    videos.unshift({
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        src,
        username: "you",
        caption,
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
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Video added to your feed");
});

/* =========================================
   FULLSCREEN VIEWER SUPPORT
========================================= */

function openViewer(src) {
    const viewer = $("#videoViewer");
    const viewerVideo = $("#viewerVideo");

    if (!viewer || !viewerVideo) return;

    viewerVideo.src = src;
    viewer.classList.add("active");
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    viewerVideo.muted = true;
    viewerVideo.play().catch(() => {});
}

function closeViewer() {
    const viewer = $("#videoViewer");
    const viewerVideo = $("#viewerVideo");

    if (!viewer) return;

    viewer.classList.remove("active");
    viewer.setAttribute("aria-hidden", "true");

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

/* =========================================
   SCROLL TO NEXT / PREVIOUS VIDEO
========================================= */

function scrollToVideo(direction) {
    const cards = $$("#videoList .video-card");
    if (!cards.length) return;

    const center = window.innerHeight / 2;
    let currentIndex = 0;
    let closestDistance = Infinity;

    cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - center);

        if (distance < closestDistance) {
            closestDistance = distance;
            currentIndex = index;
        }
    });

    const nextIndex = Math.max(
        0,
        Math.min(cards.length - 1, currentIndex + direction)
    );

    cards[nextIndex].scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

$("#scrollUp")?.addEventListener("click", () => scrollToVideo(-1));
$("#scrollDown")?.addEventListener("click", () => scrollToVideo(1));

/* =========================================
   INITIALIZE
========================================= */

renderFeed();

window.addEventListener("beforeunload", () => {
    if (previewURL) URL.revokeObjectURL(previewURL);

    uploadObjectURLs.forEach(url => URL.revokeObjectURL(url));
});
