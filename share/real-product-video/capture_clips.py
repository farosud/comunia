from pathlib import Path
from dotenv import dotenv_values
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
RAW.mkdir(parents=True, exist_ok=True)


def record_page(playwright, url: str, out_name: str, actions, duration_ms: int = 4000):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1280, "height": 720},
        record_video_dir=str(RAW),
        record_video_size={"width": 1280, "height": 720},
        device_scale_factor=1,
    )
    page = context.new_page()
    page.goto(url, wait_until="networkidle")
    page.video.path()
    actions(page)
    page.wait_for_timeout(duration_ms)
    video = page.video
    context.close()
    browser.close()
    if video is None:
      raise RuntimeError(f"No video for {out_name}")
    target = RAW / out_name
    Path(video.path()).rename(target)
    return target


def main():
    cfg = dotenv_values("/Users/emilianovelazquez/comunia/.env")
    secret = cfg.get("DASHBOARD_SECRET", "")

    with sync_playwright() as p:
        def website_actions(page):
            page.mouse.move(320, 300)
            page.wait_for_timeout(900)
            page.mouse.wheel(0, 460)
            page.wait_for_timeout(1300)
            page.mouse.wheel(0, -260)

        def dashboard_members_actions(page):
            page.fill("#login-secret", secret)
            page.click("#login-form button")
            page.wait_for_selector("#app:not(.hidden)")
            page.wait_for_timeout(700)
            page.click('[data-section="members"]')
            page.wait_for_timeout(1600)
            page.mouse.wheel(0, 180)
            page.wait_for_timeout(900)

        def dashboard_events_actions(page):
            page.fill("#login-secret", secret)
            page.click("#login-form button")
            page.wait_for_selector("#app:not(.hidden)")
            page.wait_for_timeout(700)
            page.click('[data-section="events"]')
            page.wait_for_timeout(1400)
            page.mouse.wheel(0, 380)
            page.wait_for_timeout(1000)

        print(record_page(p, "https://www.comunia.chat/", "website.webm", website_actions, 4200))
        print(record_page(p, "http://127.0.0.1:3000/", "dashboard-members.webm", dashboard_members_actions, 4200))
        print(record_page(p, "http://127.0.0.1:3000/", "dashboard-events.webm", dashboard_events_actions, 4200))


if __name__ == "__main__":
    main()
