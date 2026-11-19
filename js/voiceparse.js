// 语音答题的命令解析。只看识别文本，不碰麦克风，方便单独测试。
// 只有整句就是一个明确选项或暂停/继续时才接受。长句、噪声、两个选项叠在一起都忽略。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    const W = root.WF = root.WF || {};
    W.VoiceParse = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MIN_CONF = 0.5;
  const MAX_LEN = 16;

  const ANSWERS = {
    a: 0, b: 1, c: 2, d: 3,
    '1': 0, '2': 1, '3': 2, '4': 3,
    '一': 0, '二': 1, '三': 2, '四': 3,
    '甲': 0, '乙': 1, '丙': 2, '丁': 3,
    one: 0, two: 1, three: 2, four: 3,
    first: 0, second: 1, third: 2, fourth: 3,
  };
  const PREFIX = /^(?:选|选择|答案|我选|option|answer|choice|letter|number|the|第)?\s*/;
  const ORDINAL = { '第一个': 0, '第二个': 1, '第三个': 2, '第四个': 3, '第一': 0, '第二': 1, '第三': 2, '第四': 3 };

  function norm(raw) {
    let t = String(raw == null ? '' : raw).trim().toLowerCase();
    t = t.replace(/[，。！？、,.!?;:：；'"“”‘’()（）\-]/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/(?:吧|啊|呀|呢|了)$/g, '');
    t = t.replace(/([\u4e00-\u9fff])\s+(?=[a-d1-4])/g, '$1');
    return t;
  }

  function oneAnswer(text) {
    if (Object.prototype.hasOwnProperty.call(ORDINAL, text)) return ORDINAL[text];
    const m = /^(?:选|选择|答案是|答案|我选|我要|option|answer|choice|letter|number|the)\s*([a-d1-4一二三四甲乙丙丁]|one|two|three|four|first|second|third|fourth)$/.exec(text);
    if (m && Object.prototype.hasOwnProperty.call(ANSWERS, m[1])) return ANSWERS[m[1]];
    const bare = text.replace(PREFIX, '');
    if (bare !== text && Object.prototype.hasOwnProperty.call(ANSWERS, bare)) return ANSWERS[bare];
    if (Object.prototype.hasOwnProperty.call(ANSWERS, text)) return ANSWERS[text];
    return null;
  }

  function parseVoice(transcript, confidence) {
    const text = norm(transcript);
    if (!text) return { type: 'ignore', reason: 'empty' };
    const known = typeof confidence === 'number' && confidence > 0;
    if (known && confidence < MIN_CONF) return { type: 'ignore', reason: 'low_confidence' };
    if (text.length > MAX_LEN) return { type: 'ignore', reason: 'too_long' };
    const pause = /^(?:暂停|暂停一下|停下|停一下|pause|stop)$/.test(text);
    const resume = /^(?:继续|继续答题|恢复|恢复监听|resume|continue)$/.test(text);
    const idx = oneAnswer(text);
    const hits = (pause ? 1 : 0) + (resume ? 1 : 0) + (idx == null ? 0 : 1);
    if (hits !== 1) return { type: 'ignore', reason: hits > 1 ? 'ambiguous' : 'irrelevant' };
    if (pause) return { type: 'pause' };
    if (resume) return { type: 'resume' };
    return { type: 'answer', idx: idx };
  }

  return { parseVoice, norm, MIN_CONF, MAX_LEN };
});
