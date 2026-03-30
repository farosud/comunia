from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
RAW = OUT / "raw"
RAW.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            record_video_dir=str(RAW),
            record_video_size={"width": 1280, "height": 720},
            device_scale_factor=1,
        )
        page = context.new_page()
        page.goto("http://127.0.0.1:4175/real-demo-composition.html", wait_until="networkidle")
        page.video.path()
        page.wait_for_timeout(24000)
        video = page.video
        context.close()
        browser.close()
        if video is None:
            raise RuntimeError("No video recorded.")
        print(video.path())


if __name__ == "__main__":
    main()
