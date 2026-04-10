(function () {
  const { computed, ref } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;

  window.TM.MgrTraining = {
  name: 'MgrTraining',
  template: `
    <div class="page-stack">
      <section class="card pad">
        <h3 class="section-title">Course catalog</h3>
        <div class="card-grid">
          <div v-for="t in data.trainings" :key="t.id" class="mini-card">
            <h4>{{ t.title }}</h4>
            <p class="muted small">{{ t.description }}</p>
            <div class="tags"><span class="tag ghost">{{ t.category }}</span><span class="muted small">{{ t.durationHours }}h</span></div>
          </div>
        </div>
      </section>
      <section class="card pad">
        <h3 class="section-title">Recommend a course</h3>
        <form class="form-grid narrow" @submit.prevent="recommend">
          <label class="field"><span>Direct report</span>
            <select v-model.number="pickEmp" required>
              <option v-for="e in subs" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
          </label>
          <label class="field"><span>Course</span>
            <select v-model.number="pickCourse" required>
              <option v-for="t in data.trainings" :key="t.id" :value="t.id">{{ t.title }}</option>
            </select>
          </label>
          <button type="submit" class="btn btn-primary">Send recommendation</button>
        </form>
      </section>
      <section class="card pad">
        <h3 class="section-title">Team progress</h3>
        <table class="data-table">
          <thead><tr><th>Employee</th><th>Course</th><th>Status</th><th>Completed</th></tr></thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ empName(row.employeeId) }}</td>
              <td>{{ courseTitle(row.trainingId) }}</td>
              <td>{{ statusText(row.status) }}</td>
              <td>{{ row.completionDate || '—' }}</td>
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
    const subs = computed(() => data.employees.filter((e) => e.managerId === me.value));
    const pickEmp = ref(subs.value[0]?.id ?? null);
    const pickCourse = ref(data.trainings[0]?.id ?? null);

    const rows = computed(() =>
      data.employeeTrainings.filter((t) => subs.value.some((s) => s.id === t.employeeId)));

    function empName(id) {
      return data.employees.find((e) => e.id === id)?.name || id;
    }
    function courseTitle(id) {
      return data.trainings.find((t) => t.id === id)?.title || id;
    }
    function statusText(s) {
      return { in_progress: 'In progress', completed: 'Completed', not_started: 'Not started' }[s] || s;
    }

    function recommend() {
      if (!subs.value.length) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'No direct reports', type: 'error' } }));
        return;
      }
      if (!pickEmp.value || !pickCourse.value) return;
      data.addEmployeeTraining({
        employeeId: pickEmp.value,
        trainingId: pickCourse.value,
        status: 'in_progress',
        recommendedBy: me.value,
        completionDate: null,
      });
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Recommendation sent', type: 'success' } }));
    }

    return { data, subs, pickEmp, pickCourse, rows, empName, courseTitle, statusText, recommend };
  },
};
})();
