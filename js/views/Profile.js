(function () {
  const { ref } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;

  window.TM.ProfileView = {
  name: 'ProfileView',
  template: `
    <div class="page-stack">
      <section class="card pad">
        <h2 class="section-title">Account</h2>
        <div class="kv-grid" v-if="auth.currentUser">
          <div><span class="muted">Display name</span><div>{{ auth.currentUser.realName }}</div></div>
          <div v-if="auth.currentUser.email"><span class="muted">Sign-in email</span><div>{{ auth.currentUser.email }}</div></div>
          <div><span class="muted">Username</span><div>{{ auth.currentUser.username }}</div></div>
          <div><span class="muted">System role</span><div>{{ auth.isHrbp ? 'HRBP' : 'Reporting Manager' }}</div></div>
          <div v-if="auth.currentUser.orgRole"><span class="muted">Title (org)</span><div>{{ auth.currentUser.orgRole }} (IC/PIC/RM; separate from system role)</div></div>
          <div><span class="muted">Linked Staff ID</span><div>{{ auth.currentUser.employeeId }}</div></div>
        </div>
      </section>
      <section class="card pad">
        <h2 class="section-title">Change password</h2>
        <form class="form-grid narrow" @submit.prevent="savePwd">
          <label class="field">
            <span>New password</span>
            <input v-model="pwd1" type="password" autocomplete="new-password" required minlength="2" />
          </label>
          <label class="field">
            <span>Confirm password</span>
            <input v-model="pwd2" type="password" autocomplete="new-password" required />
          </label>
          <p v-if="msg" class="form-error">{{ msg }}</p>
          <p v-if="ok" class="form-ok">{{ ok }}</p>
          <button type="submit" class="btn btn-primary">Save</button>
        </form>
      </section>
    </div>
  `,
  setup() {
    const auth = useAuthStore();
    const data = useDataStore();
    const pwd1 = ref('');
    const pwd2 = ref('');
    const msg = ref('');
    const ok = ref('');

    function savePwd() {
      msg.value = '';
      ok.value = '';
      if (pwd1.value !== pwd2.value) {
        msg.value = 'Passwords do not match';
        return;
      }
      data.updateUserPassword(auth.currentUser.id, pwd1.value);
      auth.currentUser.password = pwd1.value;
      auth.persistSession();
      ok.value = 'Updated (demo: stored in plain text in localStorage)';
      pwd1.value = '';
      pwd2.value = '';
    }

    return { auth, pwd1, pwd2, msg, ok, savePwd };
  },
};
})();
