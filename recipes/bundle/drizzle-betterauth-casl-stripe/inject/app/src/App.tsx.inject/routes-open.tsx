<Routes>
<Route path="/login" element={<LoginPage />} />
<Route path="/signup" element={<SignupPage />} />
<Route
  path="/projects"
  element={
    <RequireAuth>
      <ProjectsListPage />
    </RequireAuth>
  }
/>
<Route
  path="/projects/:id"
  element={
    <RequireAuth>
      <ProjectDetailPage />
    </RequireAuth>
  }
/>
<Route
  path="/"
  element={
