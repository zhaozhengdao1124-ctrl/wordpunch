// Phase-one phrase questions. All content comes from the reviewed source table.
(function () {
  'use strict';
  const W = window.WF = window.WF || {};
  const BANKS = new Set(['primary','pep4','pep5','pep6','junior','nce1','nce2','nce3','nce4']);
  const SMALL = 'to at for on in of with about up out off down over away back from into by'.split(' ');
  const COMMON = new Set('to at for on in of with about up out off from by'.split(' '));
  const shuffle = (a, rnd) => { a = a.slice(); for (let i=a.length-1;i>0;i--) { const j=Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  W.phraseEntry = function (id) { return ((window.WF_PHRASES || {}).entries || []).find(e => e.id === id || e.en === id); };
  W.phrasePool = function (bank) {
    if (!BANKS.has(bank)) return [];
    const data=window.WF_PHRASES || {}, byId=new Map((data.entries || []).map(e=>[e.id,e]));
    return ((data.pools || {})[bank] || []).map(id=>byId.get(id)).filter(Boolean);
  };
  W.PhraseQuiz = class {
    constructor(bank, rnd) { this.bank=typeof bank==='string'?bank:bank.id; this.rnd=rnd || Math.random; }
    get entries() {
      const data=window.WF_PHRASES;
      if (this._data!==data || !this._entries) { this._data=data; this._entries=W.phrasePool(this.bank); }
      return this._entries;
    }
    blankDistractors(p) {
      // Match decoy exposure to the bank's real answer vocabulary rather than
      // repeatedly displaying rare never-correct words as obvious throwaways.
      const counts = new Map();
      for (const e of this.entries) if (e.blank && SMALL.includes(e.blank.word))
        counts.set(e.blank.word, (counts.get(e.blank.word) || 0) + 1);
      const no = new Set([p.blank && p.blank.word, ...(p.noDistract || [])]);
      let candidates=[...counts].filter(([word]) => !no.has(word)).map(([word,weight]) => ({word,weight}));
      if(candidates.length < 4) {
        // Sparse-bank fallback is restricted to reviewed common prepositions /
        // particles that are real answers elsewhere, never arbitrary rare words.
        const globalCounts=new Map();
        for(const e of (window.WF_PHRASES || {}).entries || [])
          if(e.blank && COMMON.has(e.blank.word)) globalCounts.set(e.blank.word,(globalCounts.get(e.blank.word)||0)+1);
        const globalTotal=[...globalCounts.values()].reduce((a,b)=>a+b,0);
        const localTotal=[...counts.values()].reduce((a,b)=>a+b,0) || 1;
        candidates=[...globalCounts].filter(([word])=>!no.has(word)).map(([word,n])=>({word,weight:0.5*n/globalTotal+0.5*(counts.get(word)||0)/localTotal}));
        candidates.fallback=true;
      }
      return candidates;
    }
    build(entry, fmt) {
      const p=typeof entry==='string'?W.phraseEntry(entry):entry;
      if (!p || !this.entries.some(e=>e.id===p.id)) return null;
      const q={word:p.en,displayWord:p.en,meaning:p.zh,pos:'',posAll:false,kind:'phrase',bank:this.bank,phraseId:p.id,fmt:fmt || 'mc',blankIdx:null,ex:p.ex || null};
      let options;
      if (q.fmt==='blank') {
        const b=p.blank, words=p.en.split(/\s+/);
        if (!b || !SMALL.includes(b.word) || words[b.idx]!==b.word) return null;
        const candidates=this.blankDistractors(p), ds=[];
        // At least four alternatives are needed for genuine variation across
        // questions. A sparse or ambiguous target falls back, never invents one.
        if(candidates.length < 4) return null;
        q.blankPoolFallback=!!candidates.fallback;
        for(let n=0;n<3;n++) {
          const total=candidates.reduce((sum,e)=>sum+e.weight,0);
          let pick=this.rnd()*total, index=candidates.length-1;
          for(let i=0;i<candidates.length;i++) if((pick-=candidates[i].weight)<0){index=i;break;}
          ds.push(candidates.splice(index,1)[0].word);
        }
        options=[b.word,...ds]; words[b.idx]='___'; q.displayWord=words.join(' '); q.blankIdx=b.idx; q.phraseHint=p.zh; q.ex=null;
      } else {
        const pf=W.Quiz.profile({meaning:p.zh}), picked=[p.zh];
        // Prefer same category, then same tier. Preserve the existing common-character safety check.
        const pool=shuffle(this.entries.filter(e=>e.id!==p.id && e.en!==p.en && e.tier===p.tier),this.rnd);
        pool.sort((a,b)=>(a.type===p.type?0:1)-(b.type===p.type?0:1));
        const candidates=pool.filter(e=>!W.Quiz.clash(pf,e.zh));
        // A greedy first pick can block a valid set in small tiers. Search for
        // three mutually compatible glosses before declaring a target unusable.
        const choose=(start, glosses)=>{
          if(glosses.length===3) return glosses;
          for(let i=start;i<=candidates.length-(3-glosses.length);i++) {
            const g=candidates[i].zh;
            if(glosses.includes(g) || glosses.some(x=>W.Quiz.clash(W.Quiz.profile({meaning:x}),g))) continue;
            const result=choose(i+1,glosses.concat(g)); if(result) return result;
          }
          return null;
        };
        const distractors=choose(0,[]);
        if(!distractors) return null; // Never display placeholder or ambiguous answers.
        picked.push(...distractors);
        options=picked;
      }
      const correct=options[0]; q.options=shuffle(options,this.rnd); q.correct=q.options.indexOf(correct); return q;
    }
    next(fmt, excluded) {
      const skip=new Set(excluded || []);
      for (const p of shuffle(this.entries.filter(e=>!skip.has(e.id)),this.rnd)) { const q=this.build(p,fmt); if(q) return q; }
      return null;
    }
  };
})();
