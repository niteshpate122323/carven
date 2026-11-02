/* =========================================================
   Workspace sidebar for every page.
   Injects its own markup, styles come from sidebar.css.

       <link rel="stylesheet" href="sidebar.css">
       <script src="sidebar.js"></script>

   Loads BEFORE the page's canvas script, exactly like shell.js
   loads before script.js: the panel is a flex sibling of the
   canvas, so it has to be in the DOM before the board measures
   the space left over for itself.

   The page supplies one thing — its canvas element sized as a
   flex sibling. See .stage in graph.html.
   ========================================================= */

(function () {
  'use strict';

  /* ---------- markup ---------- */

  const PANEL = `
<aside class="sidebar" aria-label="Workspace navigation">
  <header class="top">
    <div class="toolbar">
      <button class="icon-button" id="collapseSidebar" aria-label="Collapse sidebar"><i data-lucide="panel-left"></i></button>
      <div class="toolbar-actions">
        <button class="icon-button" aria-label="Inbox"><i data-lucide="inbox"></i></button>
        <button class="icon-button" aria-label="Create new page"><i data-lucide="square-pen"></i></button>
      </div>
    </div>
    <label class="search" aria-label="Search workspace">
      <input type="search" placeholder="Search or ask" />
      <kbd>Ctrl+K</kbd>
    </label>
  </header>

  <div class="content">
    <section class="section private">
      <div class="row page-row selected">
        <a class="page-link"><span class="label" id="pageTitleLabel">Untitled</span></a>
        <button class="icon-button page-actions" id="pageMenuTrigger" aria-haspopup="menu" aria-expanded="false" aria-controls="pageMenu" aria-label="Page options"><i data-lucide="ellipsis"></i></button>
      </div>
    </section>
  </div>

  <div class="bottom">
    <footer class="footer">
      <span class="workspace">
        <span class="workspace-name">Nitesh Patel</span>
      </span>
      <div class="footer-actions" aria-label="Workspace actions">
        <button class="icon-button" id="workspaceTrigger" aria-haspopup="menu" aria-expanded="false" aria-controls="workspaceMenu" aria-label="Workspace menu"><i data-lucide="menu"></i></button>
      </div>
    </footer>
  </div>
</aside>`;

  const OVERLAYS = `
<button class="hamburger" id="openSidebar" aria-label="Open sidebar"><i data-lucide="menu"></i></button>

<div class="workspace-menu" id="workspaceMenu" role="menu" hidden>
  <div class="menu-account">
    <span class="menu-avatar" aria-hidden="true">N</span>
    <span class="menu-account-text">
      <span class="menu-account-name">Nitesh Patel\u2019s Space</span>
      <span class="menu-plan">Free Plan \u00b7 1 member</span>
    </span>
  </div>

  <div class="menu-divider"></div>

  <a class="menu-item accent" role="menuitem" href="#upgrade"><i data-lucide="circle-arrow-up"></i><span class="label">Upgrade</span></a>
  <a class="menu-item" role="menuitem" href="#settings"><i data-lucide="settings"></i><span class="label">Settings</span></a>
  <a class="menu-item" role="menuitem" href="#invite"><i data-lucide="mail"></i><span class="label">Invite members</span></a>
  <a class="menu-item" role="menuitem" href="#add-account"><i data-lucide="user-plus"></i><span class="label">Add account</span></a>

  <div class="menu-divider"></div>

  <div class="menu-email">
    <span class="label">niteshpatel.biz@gmail.com</span>
    <button class="icon-button" aria-label="Account options"><i data-lucide="more-horizontal"></i></button>
  </div>
  <a class="menu-item" role="menuitem" href="#space"><span class="menu-avatar-sm" aria-hidden="true">N</span><span class="label">Nitesh Patel\u2019s Space</span><i class="menu-check" data-lucide="check"></i></a>
  <a class="menu-item accent" role="menuitem" href="#new-workspace"><i data-lucide="plus"></i><span class="label">New workspace</span></a>

  <div class="menu-divider"></div>

  <a class="menu-item" role="menuitem" href="#logout"><span class="label">Log out</span></a>
</div>

<div class="workspace-menu" id="pageMenu" role="menu" hidden>
  <a class="menu-item" role="menuitem" href="#rename" id="pageRename"><i data-lucide="pencil"></i><span class="label">Rename</span></a>
  <a class="menu-item danger" role="menuitem" href="#delete"><i data-lucide="trash-2"></i><span class="label">Delete</span></a>
  <a class="menu-item" role="menuitem" href="#archive"><i data-lucide="archive"></i><span class="label">Archive</span></a>
  <a class="menu-item" role="menuitem" href="#share"><i data-lucide="share"></i><span class="label">Share</span></a>
</div>`;

  // The panel leads the flex row; the overlays float above everything.
  document.body.insertAdjacentHTML('afterbegin', PANEL);
  document.body.insertAdjacentHTML('beforeend', OVERLAYS);

  /* ---------- icons ----------
     Uses Lucide if the page already loaded it, otherwise pulls it in.
     Kept optional on purpose: a blocked CDN costs the icons, not the nav. */
  function renderIcons() {
    if (window.lucide) { lucide.createIcons(); return; }
    const tag = document.createElement('script');
    tag.src = 'https://unpkg.com/lucide@latest';
    tag.onload = () => { if (window.lucide) lucide.createIcons(); };
    document.head.appendChild(tag);
  }
  renderIcons();

  /* ---------- don't leak gestures to the canvas ----------
     Boards bind wheel / pointerdown / dblclick on window for zoom and pan.
     Swallow those here so the panel stays usable, the same way shell.js
     guards the workspace bar. `click` is deliberately left to bubble, so
     a click anywhere still closes an open menu. */
  ['.sidebar', '.hamburger', '.workspace-menu'].forEach((sel) => {
    document.querySelectorAll(sel).forEach((surf) => {
      ['pointerdown', 'dblclick'].forEach((type) =>
        surf.addEventListener(type, (e) => e.stopPropagation())
      );
      surf.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    });
  });

  /* ---------- page row mirrors the board's top node ----------
     A page marks its root heading with [data-board-title] and the panel reads
     it, so neither file needs to know the other's class names (graph.html's
     title is an <h1>, index.html's is an <h2 data-edit-key> — both work).
     The observer keeps the row in step with renames, including the ones
     script.js restores from localStorage after load. */
  const titleLabel = document.getElementById('pageTitleLabel');
  const titleSource = document.querySelector('[data-board-title]');
  let renaming = false; // suspends the observer while the row itself is being typed in

  function syncTitle() {
    if (!titleSource || !titleLabel || renaming) return;
    const text = (titleSource.textContent || '').trim();
    // Same rule the board applies to its title: editable, but never blank.
    if (!text) return;
    titleLabel.textContent = text;
    // The row truncates to the panel's 410px; the title attribute carries the
    // whole string on hover, since an ellipsis hides it otherwise.
    titleLabel.title = text;
  }

  if (titleSource) {
    syncTitle();
    new MutationObserver(syncTitle).observe(titleSource, {
      childList: true, subtree: true, characterData: true
    });
  }

  /* ---------- collapse / expand ---------- */
  const sidebar = document.querySelector('.sidebar');
  const openSidebar = document.getElementById('openSidebar');
  const collapseSidebar = document.getElementById('collapseSidebar');

  /* Toggling resizes the canvas region, whose left edge slides by the
     panel's width while the animation runs. Announce it so any board on
     the page can hold its position still instead of drifting along. */
  function toggle(collapsed) {
    window.dispatchEvent(new CustomEvent('sidebar:slide', { detail: { collapsed } }));
    document.body.classList.toggle('collapsed', collapsed);
  }

  collapseSidebar.addEventListener('click', () => toggle(true));
  openSidebar.addEventListener('click', () => toggle(false));

  /* ---------- popup menus ---------- */
  const workspaceTrigger = document.getElementById('workspaceTrigger');
  const workspaceMenu = document.getElementById('workspaceMenu');
  const pageTrigger = document.getElementById('pageMenuTrigger');
  const pageMenu = document.getElementById('pageMenu');

  let currentMenu = null;
  let currentTrigger = null;

  function positionMenu(menu, trigger) {
    menu.hidden = false;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8));
    const spaceAbove = rect.top - 8;
    const spaceBelow = window.innerHeight - rect.bottom - 8;

    // Anchor above the trigger when there's more room there — the workspace
    // button sits in the footer, so its menu has to open upward.
    if (spaceAbove >= menu.offsetHeight + 8 || spaceAbove >= spaceBelow) {
      menu.style.top = 'auto';
      menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    } else {
      menu.style.bottom = 'auto';
      menu.style.top = `${rect.bottom + 6}px`;
    }
    menu.style.left = `${left}px`;
  }

  function openMenu(menu, trigger) {
    if (currentMenu && currentMenu !== menu) closeMenu();
    currentMenu = menu;
    currentTrigger = trigger;
    menu.hidden = false;
    positionMenu(menu, trigger);
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    if (!currentMenu) return;
    currentMenu.hidden = true;
    currentTrigger.setAttribute('aria-expanded', 'false');
    currentMenu = null;
    currentTrigger = null;
  }

  workspaceTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (workspaceMenu.hidden) { openMenu(workspaceMenu, workspaceTrigger); } else { closeMenu(); }
  });

  pageTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (pageMenu.hidden) { openMenu(pageMenu, pageTrigger); } else { closeMenu(); }
  });

  document.addEventListener('click', (event) => {
    if (currentMenu && !currentMenu.contains(event.target)) closeMenu();
  });

  /* Capture phase: fires before the panel's own stopPropagation can hide
     the event, so a press anywhere — canvas included — still closes a menu.
     Skips the menus and the triggers so click-to-toggle keeps working. */
  document.addEventListener('pointerdown', (event) => {
    if (!currentMenu) return;
    const t = event.target;
    if (t.closest && (t.closest('.workspace-menu') || t.closest('.icon-button'))) return;
    closeMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (renaming) return; // the row's own handler owns Escape while renaming, so it
                          // must not also pop a collapsed panel back open
    if (currentMenu) { closeMenu(); return; }
    toggle(false);
  });

  window.addEventListener('resize', () => {
    if (currentMenu) positionMenu(currentMenu, currentTrigger);
  });

  // Sidebar may slide while a menu is open; re-seat it when the move ends.
  sidebar.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'margin-left' && currentMenu) positionMenu(currentMenu, currentTrigger);
  });

  /* ---------- rename ----------
     Edits the row label in place, then writes the new name back to the page's
     [data-board-title] element — which fires the observer above, so the board's
     root node updates itself. One write path, both directions. */
  let renamePrevious = '';

  document.getElementById('pageRename').addEventListener('click', (event) => {
    event.preventDefault();
    closeMenu();
    startRename();
  });

  function onBlur() { endRename(true); }

  function startRename() {
    if (renaming) return;
    renamePrevious = titleLabel.textContent;
    renaming = true;

    titleLabel.contentEditable = 'true';
    titleLabel.spellcheck = false;
    titleLabel.focus();

    // Select the current name so typing replaces it outright.
    const range = document.createRange();
    range.selectNodeContents(titleLabel);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    titleLabel.addEventListener('blur', onBlur);
  }

  function endRename(save) {
    if (!renaming) return;

    const value = (titleLabel.textContent || '').replace(/\s+/g, ' ').trim();
    titleLabel.removeAttribute('contenteditable');
    titleLabel.removeEventListener('blur', onBlur);
    renaming = false;

    // Blank or cancelled names revert — the title is never allowed to be empty.
    const next = save && value ? value : renamePrevious;
    titleLabel.textContent = next;
    titleLabel.title = next;
    if (titleSource && save && value) titleSource.textContent = value;
  }

  // Bound once, gated on `renaming`, so repeated renames don't stack listeners.
  titleLabel.addEventListener('keydown', (event) => {
    if (!renaming) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      endRename(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      endRename(false);
    }
  });

  // Pasted rich text becomes plain, and never carries a line break into a
  // single-line label.
  titleLabel.addEventListener('paste', (event) => {
    if (!renaming) return;
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text') || '';
    document.execCommand('insertText', false, text.replace(/\s*\r?\n\s*/g, ' '));
  });
})();
