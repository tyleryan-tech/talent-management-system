/**
 * AI 数据分析 — 嵌入 Streamlit 对话界面
 */
(function () {
  const { ref, onMounted } = Vue;

  window.TM.HrbpAiAnalyst = {
    name: 'HrbpAiAnalyst',
    template: `
      <div class="page-stack ai-analyst-page">
        <div v-show="status === 'loading'" class="card pad" style="text-align:center;padding:3rem">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;color:#6366f1"></i>
          <p class="muted" style="margin-top:1rem">正在检测 AI 分析服务…</p>
        </div>

        <div v-show="status === 'online'" class="ai-analyst-frame-wrap">
          <iframe
            v-if="iframeSrc"
            :src="iframeSrc"
            class="ai-analyst-frame"
            frameborder="0"
            allow="clipboard-write"
          ></iframe>
        </div>

        <div v-show="status === 'offline'" class="card pad ai-analyst-guide">
          <div class="ai-guide-icon">
            <i class="fa-solid fa-terminal"></i>
          </div>
          <h3>AI 分析服务未启动</h3>
          <p>请按以下步骤启动后端服务：</p>
          <div class="ai-guide-steps">
            <div class="ai-guide-step">
              <span class="ai-step-num">1</span>
              <div>
                <strong>安装依赖</strong>
                <code>cd ai-analyst && pip install -r requirements.txt</code>
              </div>
            </div>
            <div class="ai-guide-step">
              <span class="ai-step-num">2</span>
              <div>
                <strong>配置环境变量</strong>
                <code>cp .env.example .env</code>
                <p class="muted small">编辑 .env 填入 DeepSeek API Key 和数据库连接串</p>
              </div>
            </div>
            <div class="ai-guide-step">
              <span class="ai-step-num">3</span>
              <div>
                <strong>启动服务</strong>
                <code>streamlit run app.py --server.port 8501</code>
              </div>
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top:1.5rem" @click="retry">
            <i class="fa-solid fa-rotate"></i> 重新检测
          </button>
        </div>
      </div>
    `,
    setup() {
      var url = 'http://localhost:8501';
      var status = ref('loading');
      var iframeSrc = ref(null);

      function setOnline() {
        status.value = 'online';
        if (!iframeSrc.value) iframeSrc.value = url;
      }

      function probe() {
        status.value = 'loading';
        var ctrl = new AbortController();
        var tid = setTimeout(function () { ctrl.abort(); }, 4000);
        fetch(url + '/_stcore/health', { signal: ctrl.signal })
          .then(function (resp) {
            clearTimeout(tid);
            if (resp.ok) { setOnline(); } else { status.value = 'offline'; }
          })
          .catch(function () {
            clearTimeout(tid);
            var ctrl2 = new AbortController();
            var tid2 = setTimeout(function () { ctrl2.abort(); }, 4000);
            fetch(url + '/_stcore/health', { mode: 'no-cors', signal: ctrl2.signal })
              .then(function () { clearTimeout(tid2); setOnline(); })
              .catch(function () { clearTimeout(tid2); status.value = 'offline'; });
          });
      }

      function retry() { probe(); }

      onMounted(function () { probe(); });

      return { status, iframeSrc, retry };
    },
  };
})();
