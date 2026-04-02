(function () {
  const { computed } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;

  window.TM.MgrLeaves = {
  name: 'MgrLeaves',
  template: `
    <div class="page-stack">
      <section class="card pad">
        <h3 class="section-title">Pending approval</h3>
        <table class="data-table">
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            <tr v-for="l in pending" :key="l.id">
              <td>{{ empName(l.employeeId) }}</td>
              <td>{{ typeLabel(l.type) }}</td>
              <td>{{ l.startDate }} ~ {{ l.endDate }}</td>
              <td class="cell-clip">{{ l.reason }}</td>
              <td class="row-actions">
                <button type="button" class="btn-link" @click="approve(l, 'approved')">Approve</button>
                <button type="button" class="btn-link danger" @click="approve(l, 'rejected')">Decline</button>
              </td>
            </tr>
            <tr v-if="!pending.length"><td colspan="5" class="muted">No pending requests</td></tr>
          </tbody>
        </table>
      </section>
      <section class="card pad">
        <h3 class="section-title">History</h3>
        <table class="data-table">
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Status</th><th>Reason</th></tr></thead>
          <tbody>
            <tr v-for="l in history" :key="l.id">
              <td>{{ empName(l.employeeId) }}</td>
              <td>{{ typeLabel(l.type) }}</td>
              <td>{{ l.startDate }} ~ {{ l.endDate }}</td>
              <td>{{ statusLabel(l.status) }}</td>
              <td class="cell-clip">{{ l.reason }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  `,
  setup() {
    const auth = useAuthStore();
    const data = useDataStore();
    const me = computed(() => auth.currentUser?.employeeId);

    const myLeaves = computed(() => data.leaveRequests.filter((l) => l.approverId === me.value));

    const pending = computed(() => myLeaves.value.filter((l) => l.status === 'pending'));
    const history = computed(() => myLeaves.value.filter((l) => l.status !== 'pending'));

    function empName(id) {
      return data.employees.find((e) => e.id === id)?.name || id;
    }
    function typeLabel(t) {
      return data.attendanceRules.labels?.[t] || t;
    }
    function statusLabel(s) {
      return { pending: 'Pending', approved: 'Approved', rejected: 'Declined' }[s] || s;
    }
    function approve(l, status) {
      data.updateLeaveStatus(l.id, status);
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: status === 'approved' ? 'Approved' : 'Declined', type: 'success' } }));
    }

    return { pending, history, empName, typeLabel, statusLabel, approve };
  },
};
})();
