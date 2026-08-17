#!/usr/bin/env python3
"""
Creator video performance scraper.

For each creator: pull last 30 TikTok videos via TikWM, compute baseline
(median of last 10 videos >= 14 days old), categorize each video as
WINNER / LOSER / PENDING / NEW_CREATOR, output three CSVs ready for paste
into a Google Sheet.

v1: TikTok only. Instagram added in v2 (public scraping is fragile,
need to evaluate Instaloader/RapidAPI/etc.).

Usage: /usr/bin/python3 scripts/_creator_perf.py
"""
import csv
import json
import os
import statistics
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from typing import List, Dict, Optional

CREATORS = [
    {"name": "Aaditya Agrawal", "tiktok": "keshah_us",        "instagram": "keshah_us"},
    {"name": "Jennifer Brada",  "tiktok": "jennifer.keshah",  "instagram": "jennifer.brada"},
    {"name": "Isai Trujillo",   "tiktok": "isai.trujillo1",   "instagram": "isai.trujillo01"},
]

# Decision thresholds
WIN_RATIO = 1.5
LOSE_RATIO = 0.5
MIN_WINS_VIEWS = 5_000      # winners must have at least 5K views (filter noise)
DECISION_DAYS = 14          # videos under this age are "pending" (not ready to call)
BASELINE_WINDOW = 10        # baseline = median of last N qualifying videos
MIN_QUALIFYING = 10         # creators below this go to NEW_CREATORS tab

OUT_DIR = os.path.expanduser(f"~/Documents/keshah_creator_perf/{datetime.now().strftime('%Y-%m-%d')}")

# ────────────────────────────────────────────────────────────
# Scrapers
# ────────────────────────────────────────────────────────────

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

def fetch_tiktok_posts(handle, count=30, retries=3):
    """Fetch last N posts from a creator's TikTok via TikWM."""
    url = f"https://www.tikwm.com/api/user/posts?unique_id={urllib.parse.quote(handle)}&count={count}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                d = json.load(r)
            if d.get("code") == 0:
                return d.get("data", {}).get("videos", [])
            msg = d.get("msg", "?")
            # Rate-limit retry
            if "limit" in msg.lower() or d.get("code") == -1:
                time.sleep(2 + attempt * 2)
                continue
            print(f"  ✗ TikWM error for {handle}: {msg}")
            return []
        except Exception as e:
            print(f"  ✗ TikWM fetch fail for {handle} (attempt {attempt+1}): {e}")
            time.sleep(1 + attempt)
    return []


# ────────────────────────────────────────────────────────────
# Normalization
# ────────────────────────────────────────────────────────────

def normalize_tiktok(handle, raw):
    """TikWM raw video → normalized dict."""
    create_time = raw.get("create_time", 0)
    posted_dt = datetime.fromtimestamp(create_time, tz=timezone.utc) if create_time else None
    days_live = (datetime.now(timezone.utc) - posted_dt).days if posted_dt else 0
    video_id = raw.get("video_id") or raw.get("aweme_id") or ""
    return {
        "platform": "TikTok",
        "video_id": video_id,
        "url": f"https://www.tiktok.com/@{handle}/video/{video_id}" if video_id else "",
        "posted": posted_dt.strftime("%Y-%m-%d") if posted_dt else "?",
        "days_live": days_live,
        "views": raw.get("play_count", 0),
        "likes": raw.get("digg_count", 0),
        "comments": raw.get("comment_count", 0),
        "shares": raw.get("share_count", 0),
        "title": (raw.get("title") or "")[:80],
    }


# ────────────────────────────────────────────────────────────
# Baseline + categorization
# ────────────────────────────────────────────────────────────

def compute_baseline(videos):
    """Median views of last BASELINE_WINDOW videos that are >= DECISION_DAYS old."""
    qualified = [v["views"] for v in videos if v["days_live"] >= DECISION_DAYS]
    if len(qualified) < MIN_QUALIFYING:
        return None
    return statistics.median(qualified[:BASELINE_WINDOW])


def categorize(video, baseline):
    """WINNER / LOSER / PENDING / NEW_CREATOR (when no baseline yet)."""
    if baseline is None:
        return "NEW_CREATOR"
    if video["days_live"] < DECISION_DAYS:
        return "PENDING"
    ratio = video["views"] / baseline if baseline else 0
    if ratio >= WIN_RATIO and video["views"] >= MIN_WINS_VIEWS:
        return "WINNER"
    if ratio <= LOSE_RATIO:
        return "LOSER"
    return "HOLD"


# ────────────────────────────────────────────────────────────
# Output
# ────────────────────────────────────────────────────────────

def write_csv(rows, path, include_ratio):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cols = ["creator", "platform", "posted", "days_live", "views"]
    if include_ratio:
        cols += ["baseline", "ratio"]
    cols += ["url", "title"]
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"  → {path}  ({len(rows)} rows)")


# ────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────

def main():
    print(f"\nCreator performance scrape — {datetime.now().isoformat(timespec='seconds')}\n")

    all_videos_per_creator = {}
    creator_meta = {}

    for c in CREATORS:
        name = c["name"]
        tt_handle = c["tiktok"]
        print(f"▸ {name} (@{tt_handle})")

        # TikTok
        raw_tt = fetch_tiktok_posts(tt_handle, count=30)
        videos = [normalize_tiktok(tt_handle, v) for v in raw_tt]
        # NOTE: Instagram coming in v2. IG public scraping is fragile;
        # need to decide between Instaloader (Python, gets blocked) or
        # paid scraper (RapidAPI ~$5/mo). For now, TikTok only.

        # Sort by days_live ascending (most recent first)
        videos.sort(key=lambda v: v["days_live"])
        baseline = compute_baseline(videos)
        qualifying_count = sum(1 for v in videos if v["days_live"] >= DECISION_DAYS)

        print(f"  pulled {len(videos)} TikTok videos | qualifying (≥14d): {qualifying_count} | baseline: {f'{int(baseline):,} views' if baseline else 'INSUFFICIENT'}")

        all_videos_per_creator[name] = videos
        creator_meta[name] = {
            "baseline": baseline,
            "qualifying_count": qualifying_count,
            "total_videos": len(videos),
            "first_video": min((v["posted"] for v in videos), default="?"),
            "wins": 0, "losses": 0, "holds": 0, "pending": 0,
        }

        # 1.5s pause to respect TikWM's 1 req/sec free tier
        time.sleep(1.5)

    # ── Categorize + tag rows ──
    winners, losers, new_creators_rows = [], [], []

    for name, videos in all_videos_per_creator.items():
        baseline = creator_meta[name]["baseline"]
        for v in videos:
            cat = categorize(v, baseline)
            ratio_str = f"{v['views']/baseline:.2f}x" if baseline else ""
            row = {
                "creator": name,
                "platform": v["platform"],
                "posted": v["posted"],
                "days_live": v["days_live"],
                "views": v["views"],
                "baseline": int(baseline) if baseline else "",
                "ratio": ratio_str,
                "url": v["url"],
                "title": v["title"],
            }
            if cat == "NEW_CREATOR":
                new_creators_rows.append(row)
            elif cat == "WINNER":
                winners.append(row)
                creator_meta[name]["wins"] += 1
            elif cat == "LOSER":
                losers.append(row)
                creator_meta[name]["losses"] += 1
            elif cat == "HOLD":
                creator_meta[name]["holds"] += 1
            elif cat == "PENDING":
                creator_meta[name]["pending"] += 1

    # ── Sort each tab: grouped by creator, then by ratio desc within creator ──
    def sort_key(r):
        try:
            ratio = float(r["ratio"].replace("x","")) if r["ratio"] else 0
        except: ratio = 0
        return (r["creator"], -ratio)
    winners.sort(key=sort_key)
    losers.sort(key=lambda r: (r["creator"], r["days_live"]))
    new_creators_rows.sort(key=lambda r: (r["creator"], r["days_live"]))

    # ── Write CSVs ──
    print(f"\nWriting CSVs to {OUT_DIR}/")
    write_csv(winners, f"{OUT_DIR}/winners.csv", include_ratio=True)
    write_csv(losers, f"{OUT_DIR}/losers.csv", include_ratio=True)
    write_csv(new_creators_rows, f"{OUT_DIR}/new_creators.csv", include_ratio=False)

    # ── Per-creator summary ──
    print(f"\nCreator scoreboard:")
    print(f"  {'creator':<22} {'total':>6} {'qualifying':>11} {'wins':>5} {'losses':>7} {'hold':>5} {'pending':>8} {'win%':>6}")
    for name, m in creator_meta.items():
        win_pct = (m["wins"] / max(1, m["wins"]+m["losses"]+m["holds"])) * 100 if m["baseline"] else 0
        print(f"  {name:<22} {m['total_videos']:>6} {m['qualifying_count']:>11} {m['wins']:>5} {m['losses']:>7} {m['holds']:>5} {m['pending']:>8} {win_pct:>5.0f}%")

    print(f"\n✅ Done. Paste each CSV into a new tab in Google Sheets.\n")


if __name__ == "__main__":
    main()
