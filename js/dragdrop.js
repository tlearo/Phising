/* dragdrop.js — Essential Eight drag & drop
   - Works with essential.html structure
   - Accessible mouse + keyboard drag/drop
   - Shuffle / Reset / Check controls
   - Progress bar + feedback updates
   - Marks completion in localStorage for current user
*/

(function () {
  'use strict';

  // ---------- DOM helpers ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function announce(msg){ try{ window.a11y?.announce?.(msg); }catch(_){} }

  // ---------- User / progress storage ----------
  function readUser(){
    try{ return JSON.parse(localStorage.getItem('user')||'null'); }catch{ return null; }
  }
  function getProgressKey(user){
    const who = user?.username || 'team';
    return `${who}_progress`;
  }
  function setEssentialDone(){
    const user = readUser();
    const key = getProgressKey(user);
    let p;
    try{ p = JSON.parse(localStorage.getItem(key)||'{}'); }catch{ p = {}; }
    p.essential = true;
    localStorage.setItem(key, JSON.stringify(p));
  }

  // ---------- Core elements ----------
  const dragList   = $('#dragList');                 // source list
  const dropList   = $('#dropList');                 // target list
  const progressEl = $('#essProgressText');          // "x/8 correct"
  const fillEl     = $('#progressFill');             // visual fill
  const feedbackEl = $('#essFeedback');
  const btnHint    = $('#essHintBtn');
  const hintBox    = $('#essHintText');

  const btnCheck   = $('#checkAnswersBtn');
  const btnShuffle = $('#shuffleBtn');
  const btnReset   = $('#resetBoardBtn');

  if (!dragList || !dropList) return; // not on this page

  const points = window.utils?.points;
  points?.ensure();
  let hintUsed = false;

  // Each draggable card has data-key; each drop-slot has data-slot and contains .slot-bay
  function allCards(){ return $$('#dragList .drag-card'); }
  function allSlots(){ return $$('#dropList .drop-slot'); }
  function slotBay(slot){ return $('.slot-bay', slot); }
  function cardKey(card){ return card?.dataset?.key; }
  function slotKey(slot){ return slot?.dataset?.slot; }

  // ---------- Make cards draggable + keyboard friendly ----------
  function makeDraggable(card){
    card.setAttribute('draggable','true');
    card.setAttribute('role','button');
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', cardKey(card) || '');
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    // Keyboard "pick up" and "drop": Space/Enter toggles grab; Arrow keys navigate
    card.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        // If card is in a slot, move it back to source; else try to drop into focused slot
        const focusedSlot = document.activeElement?.closest?.('.drop-slot');
        if (focusedSlot) {
          placeCardInSlot(card, focusedSlot);
        } else {
          // move back to source
          dragList.appendChild(card);
          announce('Returned to controls list');
        }
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        const cards = allCards();
        const idx = cards.indexOf(card);
        const next = cards[(idx + (k==='ArrowDown'?1:-1) + cards.length) % cards.length];
        next?.focus();
      }
    });
  }

  // ---------- Make slots droppable ----------
  function makeDroppable(slot){
    const bay = slotBay(slot);
    slot.setAttribute('tabindex','0');

    function allowDrop(e){
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slot.classList.add('over');
    }
    function clearOver(){ slot.classList.remove('over'); }

    slot.addEventListener('dragover', allowDrop);
    slot.addEventListener('dragenter', allowDrop);
    slot.addEventListener('dragleave', clearOver);
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      clearOver();
      const key = e.dataTransfer.getData('text/plain');
      const card = $(`.drag-card.dragging, .drag-card[data-key="${cssEscape(key)}"]`);
      if (card) placeCardInSlot(card, slot);
    });

    // Keyboard: pressing Enter/Space while a card is focused will drop into this slot (handled in card keydown)
    slot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const focusedCard = document.activeElement?.classList?.contains('drag-card') ? document.activeElement : null;
        if (focusedCard) placeCardInSlot(focusedCard, slot);
      }
    });
  }

  // ---------- Placement logic ----------
  function placeCardInSlot(card, slot){
    const bay = slotBay(slot);
    if (!bay) return;

    // If slot already has a card, return it to source before placing new one
    const existing = $('.drag-card', bay);
    if (existing) dragList.appendChild(existing);

    bay.appendChild(card);
    card.focus();
    announce(`Placed "${card.textContent.trim()}"`);
    updateProgress(false);
  }

  // ---------- Shuffle / Reset ----------
  function shuffle(){
    const cards = $$('#dragList .drag-card');
    // Fisher–Yates
    for (let i = cards.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      dragList.appendChild(cards[j]);
    }
    announce('Shuffled');
  }

  function resetBoard(){
    // Move any slotted cards back to source
    allSlots().forEach(slot => {
      const bay = slotBay(slot);
      $$('.drag-card', bay).forEach(card => dragList.appendChild(card));
    });
    // Optional: reset source order alphabetically by label text
    const src = $$('#dragList .drag-card').sort((a,b)=>a.textContent.localeCompare(b.textContent));
    src.forEach(el => dragList.appendChild(el));

    setFeedback('');
    hintUsed = false;
    hintBox?.setAttribute('hidden', 'hidden');
    updateProgress(false);
    announce('Board reset');
  }

  // ---------- Scoring ----------
  function score(){
    let correct = 0;
    allSlots().forEach(slot => {
      const bay = slotBay(slot);
      const card = $('.drag-card', bay);
      const ok = card && cardKey(card) === slotKey(slot);
      slot.classList.toggle('correct', !!ok);
      slot.classList.toggle('incorrect', card && !ok);
      if (ok) correct++;
    });
    return correct;
  }

  function setFeedback(msg, good=false){
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || '';
    feedbackEl.classList.toggle('ok', !!good);
    feedbackEl.classList.toggle('warn', !good && !!msg);
  }

  function updateProgress(isCheck){
    const total = allSlots().length;
    const correct = isCheck ? score() : countPlacedCorrectlySoft();
    // text
    if (progressEl) progressEl.textContent = `${correct}/${total} correct`;
    // bar
    if (fillEl) fillEl.style.width = `${Math.round((correct/total)*100)}%`;

    // update ARIA for any semantic progress bars nearby (optional)
    const bar = fillEl?.parentElement?.closest?.('.ess-progress') || null;
    const roleBar = $('.progress-bar', bar || document);
    if (roleBar){
      roleBar.setAttribute('aria-valuemin','0');
      roleBar.setAttribute('aria-valuemax', String(total));
      roleBar.setAttribute('aria-valuenow', String(correct));
    }

    const setPercent = window.utils?.setProgressPercent;
    if (typeof setPercent === 'function') {
      const percent = total ? Math.round((correct / total) * 100) : 0;
      setPercent('essential', percent, { complete: total > 0 && correct === total });
    }
  }

  function countPlacedCorrectlySoft(){
    // Soft count: only count if a slot has the correct card; don't mark wrong visually
    let correct = 0;
    allSlots().forEach(slot => {
      const bay = slotBay(slot);
      const card = $('.drag-card', bay);
      if (card && cardKey(card) === slotKey(slot)) correct++;
    });
    return correct;
  }

  function handleCheck(){
    const correct = score();
    const total = allSlots().length;
    updateProgress(true);

    if (correct === total){
      setFeedback('Perfect! You earned a digit for the vault.', true);
      setEssentialDone();
      announce('All correct. Essential Eight complete.');
    } else if (correct >= Math.ceil(total*0.75)) {
      setFeedback(`Close! ${correct}/${total} correct. Tweak a few and check again.`);
      announce('Almost there');
    } else {
      setFeedback(`${correct}/${total} correct. Review the descriptions and try again.`);
      announce('Keep trying');
    }
  }

  // ---------- Utils ----------
  function cssEscape(s){
    // Minimal escape for attribute selector usage
    return (s||'').replace(/["\\]/g, '\\$&');
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    // Prepare all cards and slots
    $$('#dragList .drag-card').forEach(makeDraggable);
    allSlots().forEach(makeDroppable);

    // Wire controls
    btnShuffle?.addEventListener('click', shuffle);
    btnReset  ?.addEventListener('click', resetBoard);
    btnCheck  ?.addEventListener('click', handleCheck);
    btnHint   ?.addEventListener('click', () => {
      if (hintUsed) {
        setFeedback('Hint already revealed. Group the controls by purpose.', true);
        return;
      }
      hintUsed = true;
      hintBox?.removeAttribute('hidden');
      points?.spend(5, 'Essential Eight hint');
      setFeedback('Hint revealed: relate each description to prevent / limit / detect / recover categories.', true);
    });

    // First render
    updateProgress(false);
    window.utils?.initStatusHud('essential', {
      score: '#essentialPointsTotal',
      delta: '#essentialPointsDelta',
      progressFill: '#essentialProgressFill',
      progressLabel: '#essentialProgressText'
    });
  });

})();
