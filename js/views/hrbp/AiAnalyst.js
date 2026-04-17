/**
 * AI 数据分析 — 嵌入 Streamlit 对话界面
 * 当 Streamlit 服务未启动时显示引导说明
 */
(function () {
  const { ref, onMounted, onUnmounted } = Vue;

  window.TM.HrbpAiAnalyst = {
    name: 'HrbpAiAnalyst',
    template: `
      <div class="page-stack">
        <div class="page-header">
          <h2><i class="fa-solid fa-robot"></i> AI 数据分析助手</h2>
          <p class="muted">输入中文问题，AI 自动查询 HR 数据库并生成分析报告</p>
        </div>

        <div v-if="status === 'loading'" class="card pad" style="text-align:center;padding:3rem">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;color:#6366f1"></i>
          <p class="muted" style="margin-top:1rem">正在检测 AI 分析服务…</p>
        </div>

        <div v-else-if="status === 'online'" class="ai-analyst-frame-wrap">
          <iframe
            :src="streamlitUrl"
            class="ai-analyst-frame"
            frameborder="0"
            allow="clipboard-write"
          ></iframe>
        </div>

        <div v-else class="card pad ai-analyst-guide">
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
          <button class="btn btn-primary" style="margin-top:1.5rem" @click="checkService">
            <i class="fa-solid fa-rotate"></i> 重新检测
          </button>
        </div>
      </div>
    `,
    setup() {
      const port = 8501;
      const streamlitUrl = ref('http://localhost:' + port);
      const status = ref('loading');
      let pollTimer = null;

      async function checkService() {
        status.value = 'loading';
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 4000);
          const resp = await fetch('http://localhost:' + port + '/_stcore/health', {
            mode: 'no-cors',
            signal: ctrl.signal,
          });
          clearTimeout(tid);
          status.value = 'online';
        } catch (_) {
          status.value = 'offline';
        }
      }

      onMounted(() => {
        checkService();
        pollTimer = setInterval(checkService, 15000);
      });

      onUnmounted(() => {
        if (pollTimer) clearInterval(pollTimer);
      });

      return { streamlitUrl, status, checkService };
    },
  };
})();
