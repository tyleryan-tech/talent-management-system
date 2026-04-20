(function () {
  const { computed } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;

  window.TM.MgrOrgApprovals = {
    name: 'MgrOrgApprovals',
    template: `
    <div class="page-stack">
      <div class="card pad">
        <h3 class="section-title">Organization change approval</h3>
        <p class="muted small">When you are the pending approver in the chain, act here; after the <strong>product line owner</strong> approves, changes are written to the org structure.</p>
      </div>
      <section class="card pad">
        <h3 class="section-title">My inbox</h3>
        <p v-if="!myPending.length" class="muted small">No organization requests waiting on you.</p>
        <table v-else class="data-table">
          <thead>
            <tr><th>Title</th><th>Type</th><th>Chain</th><th>Submitted</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="r in myPending" :key="r.id">
              <td class="cell-clip">{{ r.title }}</td>
              <td>{{ typeLabel(r.type) }}</td>
              <td class="cell-clip muted small">{{ chainNames(r.approvalChain) }}</td>
              <td>{{ r.submittedAt }}</td>
              <td class="row-actions">
                <button type="button" class="btn-link" @click="approve(r)">Approve</button>
                <button type="button" class="btn-link danger" @click="reject(r)">Reject</button>
              </td>
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

      const myPending = computed(() =>
        (data.orgChangeRequests || []).filter(
          (r) => r.status === 'pending' && Number(r.pendingApproverId) === Number(me.value),
        ),
      );

      function empName(id) {
        var n = Number(id);
        return data.employees.find((e) => Number(e.id) === n)?.name || id;
      }
      function typeLabel(t) {
        return {
          dept_create: 'Add department',
          dept_delete: 'Remove department',
          dept_update: 'Department change',
          position_create: 'Add Target HC',
          position_delete: 'Remove Target HC',
          position_update: 'Update Target HC',
        }[t] || t;
      }
      function chainNames(ids) {
        return (ids || []).map((id) => empName(id)).join(' → ');
      }
      function approve(r) {
        if (!me.value) return;
        if (data.approveOrgChangeRequest(r.id, me.value)) {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Approved', type: 'success' } }));
        } else {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Action failed', type: 'error' } }));
        }
      }
      function reject(r) {
        if (!me.value) return;
        const note = window.prompt('Rejection reason (optional)', '') || '';
        if (data.rejectOrgChangeRequest(r.id, me.value, note)) {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Rejected', type: 'info' } }));
        }
      }

      return { myPending, typeLabel, chainNames, approve, reject };
    },
  };
})();
