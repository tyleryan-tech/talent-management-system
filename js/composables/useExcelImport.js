/**
 * Excel 导入/导出 Composable (M-1)
 * 统一处理文件上传、字段映射、数据解析
 */
(function () {
  const { ref } = Vue;

  /**
   * @param {Object} options
   * @param {Array<{key: string, label: string, aliases?: string[]}>} options.columns - 目标字段定义
   * @param {Function} [options.onImport] - (parsedRows, mapping) => void
   * @returns {{ importing, showMapper, uploadFile, mappedData, confirmMapping, cancelMapping }}
   */
  function useExcelImport(options = {}) {
    const importing = ref(false);
    const showMapper = ref(false);
    const mappedData = ref([]);
    let _pendingFile = null;
    let _pendingMapping = null;

    function uploadFile(file) {
      importing.value = true;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' });

          if (typeof window.TM.mapUploadFields === 'function') {
            const targetFields = (options.columns || []).map((c) => ({
              key: c.key,
              label: c.label,
              aliases: c.aliases || [],
            }));
            window.TM.mapUploadFields(
              jsonData,
              targetFields,
              (mapped) => {
                mappedData.value = mapped;
                if (typeof options.onImport === 'function') {
                  options.onImport(mapped);
                }
                importing.value = false;
              },
              () => { importing.value = false; },
            );
          } else {
            mappedData.value = jsonData;
            if (typeof options.onImport === 'function') {
              options.onImport(jsonData);
            }
            importing.value = false;
          }
        } catch (err) {
          console.error('[Excel Import]', err);
          window.dispatchEvent(new CustomEvent('tm-toast', {
            detail: { message: '文件解析失败：' + (err.message || '未知错误'), type: 'error' },
          }));
          importing.value = false;
        }
      };
      reader.readAsBinaryString(file);
    }

    function exportToExcel(rows, filename, sheetName) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
      XLSX.writeFile(wb, filename || 'export.xlsx');
    }

    return {
      importing,
      showMapper,
      uploadFile,
      mappedData,
      exportToExcel,
    };
  }

  window.TM = window.TM || {};
  window.TM.useExcelImport = useExcelImport;
})();
