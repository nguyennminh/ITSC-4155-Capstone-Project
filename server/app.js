app.get('/api/profile', (req, res) =>
  res.json({ user: publicUser(req.user) })
);

app.post('/api/profile/confirm', async (req, res) => {
  const parsed = z.object({
    confirmed: z.literal(true),
    profile: profileSchema
  }).safeParse(req.body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.slice(1).join(' ') || 'Profile confirmation';
    throw new ApiError(400, `${field}: ${issue.message}`);
  }

  // Recruiter accounts must have a company name before confirmation.
  if (
    req.user.role === 'Recruiter' &&
    !parsed.data.profile.companyName?.trim()
  ) {
    throw new ApiError(
      400,
      'Company name is required for recruiter profiles.'
    );
  }

  await store.saveProfile(req.user.id, parsed.data.profile);

  // Reviewed draft has been consumed. The saved confirmed fields are now authoritative.
  await store.deleteDraft(req.user.id);

  res.json({
    user: publicUser(await store.user(req.user.id))
  });
});