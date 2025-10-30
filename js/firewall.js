(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const RULES = [
    {
      key: 'deny-malicious',
      name: 'Deny inbound from 203.0.113.0/24 (red team scanners)',
      detail: 'Shut down the malicious hosts that recently probed the DMZ web tier.',
      type: 'deny'
    },
    {
      key: 'allow-vpn',
      name: 'Allow corporate VPN (10.20.0.0/16 -> Intranet)',
      detail: 'Staff working remotely must reach internal applications through the VPN concentrator.',
      type: 'allow'
    },
    {
      key: 'allow-web',
      name: 'Allow HTTPS to DMZ load balancer (Internet -> 192.0.2.10)',
      detail: 'Customer web traffic terminates on the DMZ HTTPS listener before passing to app servers.',
      type: 'allow'
    },
    {
      key: 'allow-sftp',
      name: 'Allow partner SFTP (198.51.100.10 -> 172.16.40.5)',
      detail: 'A nightly secure file transfer from a trusted supplier must remain uninterrupted.',
      type: 'allow'
    },
    {
      key: 'deny-all',
      name: 'Deny all other traffic',
      detail: 'Catch everything you missed and keep the policy fail-closed.',
      type: 'deny'
    }
  ];

  const CORRECT_ORDER = RULES.map(rule => rule.key);

  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function setFeedback(element, message, good = false) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('ok', !!good);
    element.classList.toggle('warn', !good && !!message);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const list = $('#firewallRuleList');
    if (!list) return;

    const checkBtn = $('#firewallCheck');
    const resetBtn = $('#firewallReset');
    const feedback = $('#firewallFeedback');
    const hintBox = $('#firewallHint');

    const utils = window.utils || {};
    const getUser = utils.getUser || (() => null);
    const user = getUser();
    const userLabel = user?.username || 'team';
    const storageKey = `firewall_bonus_complete_${userLabel}`;
    let rewarded = localStorage.getItem(storageKey) === 'true';

    utils.points?.ensure?.();
    utils.initStatusHud?.('firewallBonus', {
      score: '#firewallPointsTotal',
      delta: '#firewallPointsDelta',
      progressFill: '#firewallProgressFill',
      progressLabel: '#firewallProgressText'
    });

    function renderList(order) {
      list.innerHTML = '';
      order.forEach(rule => {
        const li = document.createElement('li');
        li.className = 'firewall-rule';
        li.dataset.key = rule.key;

        const body = document.createElement('div');
        body.className = 'firewall-rule__body';

        const title = document.createElement('h3');
        title.className = 'firewall-rule__title';
        title.textContent = rule.name;

        const detail = document.createElement('p');
        detail.className = 'firewall-rule__detail muted';
        detail.textContent = rule.detail;

        body.appendChild(title);
        body.appendChild(detail);

        const actions = document.createElement('div');
        actions.className = 'firewall-rule__actions';

        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'btn ghost sm';
        upBtn.dataset.move = 'up';
        upBtn.textContent = 'Move up';

        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.className = 'btn ghost sm';
        downBtn.dataset.move = 'down';
        downBtn.textContent = 'Move down';

        actions.appendChild(upBtn);
        actions.appendChild(downBtn);

        li.appendChild(body);
        li.appendChild(actions);

        list.appendChild(li);
      });
      refreshMoveButtons();
    }

    function refreshMoveButtons() {
      const items = $$('.firewall-rule', list);
      items.forEach((item, idx) => {
        const up = $('[data-move="up"]', item);
        const down = $('[data-move="down"]', item);
        if (up) {
          if (idx === 0) up.setAttribute('disabled', 'disabled');
          else up.removeAttribute('disabled');
        }
        if (down) {
          if (idx === items.length - 1) down.setAttribute('disabled', 'disabled');
          else down.removeAttribute('disabled');
        }
      });
    }

    function moveItem(li, direction) {
      if (!li) return;
      if (direction === 'up') {
        const prev = li.previousElementSibling;
        if (prev) {
          list.insertBefore(li, prev);
        }
      } else if (direction === 'down') {
        const next = li.nextElementSibling;
        if (next) {
          list.insertBefore(next, li);
        }
      }
      refreshMoveButtons();
    }

    function currentOrder() {
      return $$('.firewall-rule', list).map(item => item.dataset.key);
    }

    function evaluateOrder() {
      const order = currentOrder();
      let matches = 0;
      order.forEach((key, index) => {
        if (key === CORRECT_ORDER[index]) matches += 1;
      });
      const percent = Math.round((matches / CORRECT_ORDER.length) * 100);
      const perfect = matches === CORRECT_ORDER.length;
      return { order, matches, percent, perfect };
    }

    function updateProgress(percent, complete) {
      if (typeof utils.setProgressPercent === 'function') {
        utils.setProgressPercent('firewallBonus', percent, { complete });
      }
    }

    function awardBonus() {
      if (rewarded) return;
      utils.points?.add?.(5, 'Firewall bonus challenge');
      localStorage.setItem(storageKey, 'true');
      rewarded = true;
    }

    function resetProgressMarkers() {
      if (rewarded) {
        updateProgress(100, true);
        return;
      }
      updateProgress(0, false);
    }

    list.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-move]');
      if (!button) return;
      const li = button.closest('.firewall-rule');
      moveItem(li, button.dataset.move);
      utils.announce?.(button.dataset.move === 'up' ? 'Moved up' : 'Moved down');
    });

    checkBtn?.addEventListener('click', () => {
      const { percent, perfect, matches } = evaluateOrder();
      const missing = CORRECT_ORDER.length - matches;
      if (perfect) {
        setFeedback(feedback, 'Perfect priority! Malicious hosts are blocked and business traffic is safe.', true);
        hintBox?.setAttribute('hidden', 'hidden');
        awardBonus();
        updateProgress(100, true);
      } else {
        const summary = missing === 1
          ? 'One rule is still out of position.'
          : `${missing} rules are in the wrong spot.`;
        setFeedback(feedback, `${summary} Review the order: start with specific denies, group the business allows, finish with deny all.`, false);
        hintBox?.removeAttribute('hidden');
        updateProgress(percent, false);
      }
    });

    resetBtn?.addEventListener('click', () => {
      const shuffled = shuffle(RULES);
      renderList(shuffled);
      setFeedback(feedback, '');
      hintBox?.setAttribute('hidden', 'hidden');
      if (!rewarded) updateProgress(0, false);
      utils.announce?.('Rules reset');
    });

    const startOrder = rewarded ? RULES : shuffle(RULES);
    renderList(startOrder);
    resetProgressMarkers();

    if (rewarded) {
      setFeedback(feedback, 'Bonus already claimed. Revisit the rule order anytime for a refresher.', true);
      hintBox?.setAttribute('hidden', 'hidden');
    }
  });
})();
