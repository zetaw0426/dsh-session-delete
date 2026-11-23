/**
 * Client half of session-delete: a Delete row in the session "..." menu
 * (sidebar.workspaces.session.menu.item) and a confirmation dialog in
 * shell.overlay. Self-contained controls styled with host theme tokens;
 * the only module import is the baseline React.
 */
window.__ModuleLoader__.load({
  id: '@local/session-delete',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'sessionDelete';

    const en = {
      menuLabel: 'Delete session',
      dialogTitle: 'Delete this session?',
      dialogBody: '“{title}” and its conversation history will be permanently deleted. This cannot be undone.',
      confirm: 'Delete',
      cancel: 'Cancel',
      deleting: 'Deleting…',
      'err.session-live': 'This session is open or running. Switch to another session and stop its work, then try again.',
      'err.not-found': 'No stored log was found for this session.',
      'err.bad-id': 'The session id is invalid.',
      'err.registry-failed': 'Could not update the workspace list. Nothing was deleted.',
      'err.io-failed': 'Deleting the session files failed.',
      'err.network': 'Could not reach the Harness host.',
      'err.generic': 'Deletion failed ({code}).',
    };
    const zh = {
      menuLabel: '删除会话',
      dialogTitle: '删除此会话？',
      dialogBody: '将永久删除“{title}”及其对话历史，此操作无法撤销。',
      confirm: '删除',
      cancel: '取消',
      deleting: '正在删除…',
      'err.session-live': '该会话当前已打开或正在运行。请先切换到其他会话并停止其工作，然后再删除。',
      'err.not-found': '未找到该会话的存储日志。',
      'err.bad-id': '会话 ID 无效。',
      'err.registry-failed': '更新工作区列表失败，未删除任何内容。',
      'err.io-failed': '删除会话文件失败。',
      'err.network': '无法连接 Harness 主机。',
      'err.generic': '删除失败（{code}）。',
    };

    const KNOWN_CODES = new Set(['session-live', 'not-found', 'bad-id', 'registry-failed', 'io-failed', 'network']);

    const CSS = `
.sd-menu-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; font-family: inherit; }
.sd-menu-row:hover { background: var(--dsw-alias-bg-layer-2); }
.sd-menu-row:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.sd-menu-row.sd-danger { color: var(--dsw-alias-state-error-primary); }
.sd-menu-row.sd-sep { border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 4px; padding-top: 8px; border-radius: 0 0 6px 6px; }
.sd-scrim { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent); }
.sd-dialog { background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 20px; width: min(420px, calc(100vw - 48px)); box-shadow: 0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent); }
.sd-title { margin: 0 0 8px; font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.sd-body { margin: 0 0 16px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.sd-error { margin: 0 0 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
.sd-actions { display: flex; justify-content: flex-end; gap: 8px; }
.sd-btn { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; cursor: pointer; font-family: inherit; }
.sd-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.sd-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sd-btn:disabled { opacity: 0.6; cursor: default; }
.sd-btn-danger { background: var(--dsw-alias-state-error-primary); border-color: transparent; color: #fff; }
.sd-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 85%, var(--dsw-alias-label-primary)); }
`;

    function createStore() {
      let state = null;
      const subscribers = new Set();
      return {
        get: () => state,
        set: (next) => {
          state = next;
          for (const fn of [...subscribers]) fn();
        },
        subscribe: (fn) => {
          subscribers.add(fn);
          return () => subscribers.delete(fn);
        },
      };
    }

    async function performDelete(store, request) {
      store.set({ ...request, phase: 'busy', error: null });
      try {
        const res = await fetch('/session-delete/delete', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: request.sessionId }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.ok === true) {
          store.set(null);
          return;
        }
        const code = data && typeof data.code === 'string' ? data.code : `http-${res.status}`;
        store.set({ ...request, phase: 'confirm', error: code });
      } catch {
        store.set({ ...request, phase: 'confirm', error: 'network' });
      }
    }

    function trashIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M2.5 4h11', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('path', { d: 'M6.5 2h3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('path', { d: 'M3.5 4l.7 9a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-9', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M6.5 7v4.5M9.5 7v4.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }));
    }

    function DeleteMenuRow(props) {
      const { sessionId, displayTitle, useMenuOpenState, t, openDelete } = props;
      if (typeof openDelete !== 'function') return null;
      const menuState = typeof useMenuOpenState === 'function' ? useMenuOpenState() : null;
      const setMenuOpen = menuState ? menuState[1] : undefined;
      const label = typeof t === 'function' ? t('menuLabel') : en.menuLabel;
      return h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'sd-menu-row sd-danger sd-sep',
        onClick: () => {
          if (typeof setMenuOpen === 'function') setMenuOpen(false);
          openDelete(sessionId, displayTitle);
        },
      }, trashIcon(), h('span', null, label));
    }

    function ConfirmOverlay(props) {
      const { t, store } = props;
      if (!store || typeof store.subscribe !== 'function') return null;
      const translate = typeof t === 'function' ? t : (key, params) => {
        let text = en[key] ?? key;
        if (params) {
          for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
        }
        return text;
      };
      const request = React.useSyncExternalStore(store.subscribe, store.get);
      const cancelRef = React.useRef(null);
      const phase = request ? request.phase : null;
      React.useEffect(() => {
        if (phase === 'confirm') cancelRef.current?.focus();
      }, [phase, request ? request.sessionId : null]);

      const dialog = request === null ? null : h('div', {
        className: 'sd-scrim',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && request.phase !== 'busy') store.set(null);
        },
        onKeyDown: (event) => {
          if (event.key === 'Escape' && request.phase !== 'busy') store.set(null);
        },
      }, h('div', {
        className: 'sd-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'sd-dialog-title',
      },
        h('h2', { id: 'sd-dialog-title', className: 'sd-title' }, translate('dialogTitle')),
        h('p', { className: 'sd-body' }, translate('dialogBody', { title: request.displayTitle || request.sessionId })),
        request.error !== null
          ? h('p', { className: 'sd-error', role: 'alert' },
              KNOWN_CODES.has(request.error) ? translate(`err.${request.error}`) : translate('err.generic', { code: request.error }))
          : null,
        h('div', { className: 'sd-actions' },
          h('button', {
            type: 'button',
            className: 'sd-btn',
            ref: cancelRef,
            disabled: request.phase === 'busy',
            onClick: () => store.set(null),
          }, translate('cancel')),
          h('button', {
            type: 'button',
            className: 'sd-btn sd-btn-danger',
            disabled: request.phase === 'busy',
            onClick: () => { void performDelete(store, request); },
          }, request.phase === 'busy' ? translate('deleting') : translate('confirm')))));

      return h(React.Fragment, null, h('style', null, CSS), dialog);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const store = createStore();
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'session-delete: dictionaries');
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'session-delete.delete',
          order: 500,
          locale: NS,
          inject: () => ({
            openDelete: (sessionId, displayTitle) => store.set({ sessionId, displayTitle, phase: 'confirm', error: null }),
          }),
        }, DeleteMenuRow));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-delete.confirm',
          order: 100,
          locale: NS,
          inject: () => ({ store }),
        }, ConfirmOverlay));
      },
    };
  },
});