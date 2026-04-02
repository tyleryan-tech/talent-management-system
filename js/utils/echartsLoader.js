/** 动态加载 ECharts（CDN） */
(function (TM) {
  TM.loadEcharts = function loadEcharts() {
    if (window.echarts) return Promise.resolve(window.echarts);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
      s.onload = () => resolve(window.echarts);
      s.onerror = () => reject(new Error('ECharts 加载失败'));
      document.head.appendChild(s);
    });
  };
})(window.TM);
