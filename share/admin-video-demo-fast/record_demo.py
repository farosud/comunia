from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent
VIDEO_DIR = ROOT / "output" / "raw"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            record_video_dir=str(VIDEO_DIR),
            record_video_size={"width": 1280, "height": 720},
            device_scale_factor=1,
        )
        page = context.new_page()
        page.goto("http://127.0.0.1:4174", wait_until="networkidle")
        page.video.path()
        page.wait_for_timeout(22500)
        video = page.video
        context.close()
        browser.close()
        if video is None:
            raise RuntimeError("Playwright did not produce a video.")
        print(video.path())


if __name__ == "__main__":
    main()
