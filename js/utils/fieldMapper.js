/**
 * Universal field-mapping engine + confirmation dialog.
 * Reusable across all upload entry points (Pipeline, Roster, Attendance, etc.).
 *
 * API:
 *   TM.fieldMapper.match(schema, fileHeaders) → mappingResults[]
 *   TM.fieldMapper.apply(json, mapping)        → transformed row[]
 *   TM.FieldMapDialog                          → Vue component (modal)
 */
(function (w) {
  w.TM = w.TM || {};

  /* ── Normalisation ── */
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[_\-\s]+/g, ' ').replace(/[^\w\u4e00-\u9fff ]/g, '').trim();
  }

  function bigrams(str) {
    const g = [];
    const s = ` ${str} `;
    for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2));
    return g;
  }

  function dice(a, b) {
    const A = norm(a), B = norm(b);
    if (!A || !B) return 0;
    if (A === B) return 1;
    const ga = bigrams(A);
    const gb = new Map();
    bigrams(B).forEach((x) => gb.set(x, (gb.get(x) || 0) + 1));
    let inter = 0;
    ga.forEach((x) => { const n = gb.get(x) || 0; if (n > 0) { inter++; gb.set(x, n - 1); } });
    const denom = ga.length + bigrams(B).length;
    return denom ? (2 * inter) / denom : 0;
  }

  /**
   * Score a file header against a schema field.
   * @param {string} header  – column header from the uploaded file
   * @param {object} field   – { key, label, aliases:string[], keywords:string[] }
   * @returns {number} 0..1
   */
  function scoreField(header, field) {
    const h = norm(header);
    if (!h) return 0;
    let best = 0;
    const pool = [field.label, ...(field.aliases || []), ...(field.keywords || [])];
    pool.forEach((t) => {
      const tn = norm(t);
      if (!tn) return;
      if (h === tn) { best = 1; return; }
      if (h.includes(tn) || tn.includes(h)) {
        const ratio = Math.min(h.length, tn.length) / Math.max(h.length, tn.length);
        if (ratio >= 0.4) best = Math.max(best, 0.75 + ratio * 0.15);
      }
      best = Math.max(best, dice(h, tn));
    });
    return best;
  }

  const CONFIDENCE = { exact: 0.95, high: 0.7, medium: 0.5, low: 0.35 };

  function confidenceLevel(score) {
    if (score >= CONFIDENCE.exact) return 'exact';
    if (score >= CONFIDENCE.high) return 'high';
    if (score >= CONFIDENCE.medium) return 'medium';
    if (score >= CONFIDENCE.low) return 'low';
    return 'none';
  }

  /**
   * Match file headers to a schema.
   * @param {Array<{key:string, label:string, aliases?:string[], keywords?:string[], required?:boolean}>} schema
   * @param {string[]} fileHeaders – first row of the uploaded file
   * @returns {Array<{fieldKey:string, fieldLabel:string, header:string|null, score:number, confidence:string, required:boolean}>}
   */
  function match(schema, fileHeaders) {
    const headers = (fileHeaders || []).map((h) => String(h).trim());
    const pairs = [];
    headers.forEach((header, hIdx) => {
      schema.forEach((field) => {
        const sc = scoreField(header, field);
        if (sc >= CONFIDENCE.low) pairs.push({ hIdx, header, fieldKey: field.key, sc });
      });
    });
    pairs.sort((a, b) => b.sc - a.sc);
    const usedH = new Set();
    const usedF = new Set();
    const assigned = {};
    pairs.forEach(({ hIdx, header, fieldKey, sc }) => {
      if (usedH.has(hIdx) || usedF.has(fieldKey)) return;
      usedH.add(hIdx);
      usedF.add(fieldKey);
      assigned[fieldKey] = { header, score: sc };
    });
    return schema.map((field) => {
      const a = assigned[field.key];
      return {
        fieldKey: field.key,
        fieldLabel: field.label,
        header: a ? a.header : null,
        score: a ? a.score : 0,
        confidence: a ? confidenceLevel(a.score) : 'none',
        required: !!field.required,
      };
    });
  }

  /**
   * Apply confirmed mapping to JSON rows.
   * @param {object[]} json – raw sheet_to_json rows
   * @param {Array<{fieldKey:string, header:string|null}>} mapping
   * @returns {object[]} rows keyed by fieldKey
   */
  function apply(json, mapping) {
    const headerToField = {};
    mapping.forEach((m) => { if (m.header) headerToField[m.header] = m.fieldKey; });
    return (json || []).map((row) => {
      const out = {};
      mapping.forEach((m) => { out[m.fieldKey] = ''; });
      Object.keys(row).forEach((h) => {
        const fk = headerToField[h];
        if (fk) out[fk] = row[h];
      });
      return out;
    });
  }

  w.TM.fieldMapper = { match, apply, scoreField, norm, dice, CONFIDENCE, confidenceLevel };

  /* ── Vue dialog component ── */
  const { ref, computed } = Vue;

  w.TM.FieldMapDialog = {
    name: 'FieldMapDialog',
    props: {
      visible: Boolean,
      mapping: { type: Array, default: () => [] },
      fileHeaders: { type: Array, default: () => [] },
      title: { type: String, default: '字段映射确认' },
    },
    emits: ['confirm', 'cancel'],
    template: `
      <div v-if="visible" class="modal-backdrop" @click.self="$emit('cancel')">
        <div class="modal-box fmap-modal">
          <h3>{{ title }}</h3>
          <p class="muted small" style="margin-bottom:10px">
            系统已自动识别上传文件的列与系统字段的对应关系。
            <span style="color:#dc2626">红色</span> 表示未匹配，请手动选择或留空跳过。
          </p>
          <div class="fmap-scroll">
            <table class="fmap-table">
              <thead>
                <tr>
                  <th style="text-align:left">系统字段</th>
                  <th style="text-align:left">匹配到的文件列</th>
                  <th>置信度</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in localMapping" :key="row.fieldKey"
                  :class="{ 'fmap-row-warn': !row.header && row.required, 'fmap-row-none': !row.header }">
                  <td class="fmap-field">
                    {{ row.fieldLabel }}
                    <span v-if="row.required" class="fmap-req">*</span>
                  </td>
                  <td>
                    <select v-model="row.header" class="input input-sm fmap-select"
                      :class="{ 'fmap-select-none': !row.header }">
                      <option :value="null">（不导入）</option>
                      <option v-for="h in headerOptions" :key="h" :value="h">{{ h }}</option>
                    </select>
                  </td>
                  <td class="fmap-conf">
                    <span v-if="row.header" class="fmap-badge" :data-conf="row.confidence">{{ confLabel(row.confidence) }}</span>
                    <span v-else class="muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="$emit('cancel')">取消上传</button>
            <button type="button" class="btn btn-primary" @click="doConfirm">确认导入</button>
          </div>
        </div>
      </div>
    `,
    setup(props, { emit }) {
      const localMapping = ref([]);

      const headerOptions = computed(() => props.fileHeaders || []);

      function confLabel(c) {
        return { exact: '精确', high: '高', medium: '中', low: '低', manual: '手动', none: '—' }[c] || '—';
      }

      function syncFromProps() {
        localMapping.value = (props.mapping || []).map((m) => ({
          fieldKey: m.fieldKey,
          fieldLabel: m.fieldLabel,
          header: m.header,
          confidence: m.confidence,
          required: m.required,
          score: m.score,
        }));
      }

      Vue.watch(() => props.mapping, syncFromProps, { immediate: true, deep: true });

      Vue.watch(() => localMapping.value, (rows) => {
        rows.forEach((row) => {
          if (row.header) {
            const orig = (props.mapping || []).find((m) => m.fieldKey === row.fieldKey);
            if (orig && orig.header === row.header) {
              row.confidence = orig.confidence;
            } else {
              row.confidence = 'manual';
            }
          } else {
            row.confidence = 'none';
          }
        });
      }, { deep: true });

      function doConfirm() {
        emit('confirm', localMapping.value.map((m) => ({
          fieldKey: m.fieldKey,
          fieldLabel: m.fieldLabel,
          header: m.header,
          required: m.required,
        })));
      }

      return { localMapping, headerOptions, confLabel, doConfirm };
    },
  };
})(window);
