(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const out=$('#binFeedback'), inp=$('#binInput');

  function decode(){
    const bits = (inp.value||'').trim().split(/\s+/);
    if (!bits.length) return '';
    let s='';
    for(const b of bits){
      if(!/^[01]{8}$/.test(b)) return '';
      s += String.fromCharCode(parseInt(b,2));
    }
    return s;
  }
  function check(){
    const s = decode();
    if(!s){ out.textContent='Enter 8-bit groups separated by spaces.'; out.className='feedback warn'; return; }
    // Example target ends with a digit; store it for vault
    const last = s.slice(-1);
    if(/\d/.test(last)){
      localStorage.setItem('lock_digit_binary', last);
      out.textContent = `✅ Decoded: "${s}". Vault digit captured: ${last}`;
      out.className='feedback ok';
      // Mark progress if you want to include as a 5th puzzle later
    } else {
      out.textContent='Decoded text has no ending digit — try another message.';
      out.className='feedback warn';
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('#binCheck')?.addEventListener('click',check);
    $('#binClear')?.addEventListener('click',()=>{inp.value=''; out.textContent='';});
  });
})();
