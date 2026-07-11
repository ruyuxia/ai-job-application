export function fromJobRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    company: row.company,
    title: row.title,
    location: row.location,
    language: row.language,
    sourceUrl: row.source_url,
    officialUrl: row.official_url,
    jdText: row.jd_text,
    status: row.status,
    verificationStatus: row.verification_status,
    fitScore: row.fit_score,
    analysis: row.analysis,
    officialVerification: row.official_verification,
    nextAction: row.next_action,
    createdAt: row.created_at
  };
}
