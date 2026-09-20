export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>تعذر تحميل الصفحة | This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --bg: #fafafa;
        --card-bg: #ffffff;
        --text: #0f172a;
        --muted: #64748b;
        --primary: #059669;
        --primary-fg: #ffffff;
        --border: #e2e8f0;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #090d16;
          --card-bg: #111827;
          --text: #f8fafc;
          --muted: #94a3b8;
          --border: #1f2937;
        }
      }
      * { box-sizing: border-box; }
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: var(--bg);
        color: var(--text);
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
        padding: 1.5rem;
      }
      .card {
        max-width: 28rem;
        width: 100%;
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 1rem;
        text-align: center;
        padding: 2.25rem 1.75rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      }
      .icon {
        width: 3rem;
        height: 3rem;
        margin: 0 auto 1.25rem;
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font-size: 1.5rem;
        font-weight: bold;
      }
      h1 { font-size: 1.35rem; margin: 0 0 0.5rem; font-weight: 700; line-height: 1.3; }
      h2 { font-size: 0.95rem; margin: 0 0 1rem; font-weight: 500; color: var(--muted); }
      p { color: var(--muted); margin: 0 0 1.75rem; font-size: 0.9rem; line-height: 1.6; }
      .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      a, button {
        padding: 0.65rem 1.25rem;
        border-radius: 0.5rem;
        font: inherit;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        border: 1px solid transparent;
        transition: opacity 0.15s ease;
      }
      a:hover, button:hover { opacity: 0.9; }
      .primary { background: var(--primary); color: var(--primary-fg); }
      .secondary { background: transparent; color: var(--text); border-color: var(--border); }
    </style>
  </head>
  <body>
    <div class="card" role="alert" aria-live="polite">
      <div class="icon" aria-hidden="true">!</div>
      <h1>تعذر تحميل الصفحة</h1>
      <h2>This page didn't load</h2>
      <p>
        حدث خطأ غير متوقع أثناء معالجة طلبك. يمكنك تحديث الصفحة لإعادة المحاولة أو العودة للصفحة الرئيسية.<br />
        <span style="font-size: 0.85em; opacity: 0.85;">Something went wrong on our end. You can try refreshing or head back home.</span>
      </p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">إعادة المحاولة / Try again</button>
        <a class="secondary" href="/">الرئيسية / Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
