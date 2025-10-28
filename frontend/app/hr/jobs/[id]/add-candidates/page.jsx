"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { jobService, candidateService, authService } from "@/lib/auth";

export default function AddCandidatesPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.id;

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);
  const [roundId, setRoundId] = useState("");
  const [cands, setCands] = useState([]); // editable candidate entries
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authService.isAuthenticated() || !authService.hasRole("HR")) {
      router.push("/");
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const data = await jobService.getJob(jobId);
        setJob(data.job);
        const first = data?.job?.rounds?.[0]?.id || "";
        setRoundId(first);
      } catch (e) {
        setError(e.message || "Failed to load job");
      } finally {
        setLoading(false);
      }
    };
    if (jobId) load();
  }, [jobId, router]);

  const handleUpload = async (e) => {
    try {
      setError("");
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const data = await candidateService.uploadResumes(files);
      const parsed = (data.candidates || []).map((c) => ({
        name: c.name || "",
        email: c.email || "",
        contact: c.contact || "",
        cgpa_percentage: c.cgpa_percentage || "",
        years_experience: c.years_experience || 0,
        skills_summary: c.skills_summary || "",
        resume_url: c.resume_url || "",
        // pass-through AI summary (string or object) so backend can persist jsonb
        ai_summary: c.ai_summary || null,
        // structured arrays only
        educations: Array.isArray(c.educations) ? c.educations : [],
        work_history: Array.isArray(c.work_history) ? c.work_history : [],
      }));
      setCands(parsed);
    } catch (e) {
      setError(e.message || "Failed to parse resumes");
    } finally {
      // reset input value to allow re-uploading same files
      e.target.value = "";
    }
  };

  const addEmptyCandidate = () => {
    setCands((prev) => [
      ...prev,
      {
        name: "",
        email: "",
        contact: "",
        cgpa_percentage: "",
        years_experience: 0,
        skills_summary: "",
        resume_url: "",
        educations: [],
        work_history: [],
      },
    ]);
  };

  const updateField = (idx, field, value) => {
    setCands((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  // Dynamic sections helpers
  const addEducation = (idx) => {
    setCands((prev) => prev.map((c, i) => (
      i === idx ? { ...c, educations: [...(c.educations || []), { college: '', degree: '', year: '' }] } : c
    )));
  };
  const updateEducation = (idx, eidx, field, value) => {
    setCands((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      const arr = [...(c.educations || [])];
      arr[eidx] = { ...arr[eidx], [field]: value };
      return { ...c, educations: arr };
    }));
  };
  const removeEducation = (idx, eidx) => {
    setCands((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      const arr = [...(c.educations || [])];
      arr.splice(eidx, 1);
      return { ...c, educations: arr };
    }));
  };
  const addWork = (idx) => {
    setCands((prev) => prev.map((c, i) => (
      i === idx ? { ...c, work_history: [...(c.work_history || []), { company: '', role: '', duration: '' }] } : c
    )));
  };
  const updateWork = (idx, widx, field, value) => {
    setCands((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      const arr = [...(c.work_history || [])];
      arr[widx] = { ...arr[widx], [field]: value };
      return { ...c, work_history: arr };
    }));
  };
  const removeWork = (idx, widx) => {
    setCands((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      const arr = [...(c.work_history || [])];
      arr.splice(widx, 1);
      return { ...c, work_history: arr };
    }));
  };

  const removeCandidate = (idx) => {
    setCands((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit = useMemo(() => {
    return !!roundId && cands.length > 0;
  }, [roundId, cands.length]);

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError("");
      if (!roundId) throw new Error("Please select a round");
      await candidateService.createCandidates(cands, roundId);
      router.push(`/hr?expand=${jobId}`);
    } catch (e) {
      setError(e.message || "Failed to add candidates");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-4 text-red-600">{error}</div>
        <button className="px-4 py-2 bg-gray-200 rounded" onClick={() => router.back()}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Add Candidates</h1>
          <p className="text-gray-600">Job: {job?.name}</p>
        </div>

        <div className="bg-white border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Round</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={roundId}
                onChange={(e) => setRoundId(e.target.value)}
              >
                {(job?.rounds || []).map((r, idx) => (
                  <option key={r.id} value={r.id}>
                    Round {idx + 1}: {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Upload Resumes (PDF) - Single or Bulk</label>
              <input type="file" accept="application/pdf" multiple onChange={handleUpload} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Candidate Entries ({cands.length})</h2>
          <button className="px-3 py-2 bg-gray-100 rounded border" onClick={addEmptyCandidate}>Add Empty</button>
        </div>

        {cands.length === 0 ? (
          <div className="text-gray-500">Upload resumes to parse or add manually.</div>
        ) : (
          <div className="space-y-6">
            {cands.map((c, idx) => (
              <div key={idx} className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-gray-900">Candidate {idx + 1}</div>
                  <button className="text-sm text-red-600" onClick={() => removeCandidate(idx)}>Remove</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium">Name</label>
                    <input className="w-full border rounded px-3 py-2" value={c.name}
                      onChange={(e) => updateField(idx, "name", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Email</label>
                    <input className="w-full border rounded px-3 py-2" value={c.email}
                      onChange={(e) => updateField(idx, "email", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Contact</label>
                    <input className="w-full border rounded px-3 py-2" value={c.contact}
                      onChange={(e) => updateField(idx, "contact", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">CGPA / %</label>
                    <input className="w-full border rounded px-3 py-2" value={c.cgpa_percentage}
                      onChange={(e) => updateField(idx, "cgpa_percentage", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Years Experience</label>
                    <input type="number" min="0" className="w-full border rounded px-3 py-2" value={c.years_experience}
                      onChange={(e) => updateField(idx, "years_experience", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Skills Summary</label>
                    <input className="w-full border rounded px-3 py-2" value={c.skills_summary}
                      onChange={(e) => updateField(idx, "skills_summary", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Resume URL (optional)</label>
                    <input className="w-full border rounded px-3 py-2" value={c.resume_url}
                      onChange={(e) => updateField(idx, "resume_url", e.target.value)} />
                  </div>
                </div>

                {/* Educations */}
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Education</h4>
                    <button className="text-sm px-2 py-1 border rounded" onClick={() => addEducation(idx)}>Add Education</button>
                  </div>
                  {(c.educations || []).length === 0 ? (
                    <div className="text-xs text-gray-500 mt-2">No education entries</div>
                  ) : (
                    <div className="space-y-3 mt-2">
                      {(c.educations || []).map((ed, eidx) => (
                        <div key={eidx} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-sm">College</label>
                            <input className="w-full border rounded px-3 py-2" value={ed.college || ''} onChange={(e)=>updateEducation(idx, eidx, 'college', e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-sm">Degree</label>
                            <input className="w-full border rounded px-3 py-2" value={ed.degree || ''} onChange={(e)=>updateEducation(idx, eidx, 'degree', e.target.value)} />
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-sm">Year</label>
                              <input className="w-full border rounded px-3 py-2" value={ed.year || ''} onChange={(e)=>updateEducation(idx, eidx, 'year', e.target.value)} />
                            </div>
                            <button className="text-red-600 text-sm h-9 mt-5" onClick={()=>removeEducation(idx, eidx)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Work History */}
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Work History</h4>
                    <button className="text-sm px-2 py-1 border rounded" onClick={() => addWork(idx)}>Add Work</button>
                  </div>
                  {(c.work_history || []).length === 0 ? (
                    <div className="text-xs text-gray-500 mt-2">No work entries</div>
                  ) : (
                    <div className="space-y-3 mt-2">
                      {(c.work_history || []).map((w, widx) => (
                        <div key={widx} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-sm">Company</label>
                            <input className="w-full border rounded px-3 py-2" value={w.company || ''} onChange={(e)=>updateWork(idx, widx, 'company', e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-sm">Role</label>
                            <input className="w-full border rounded px-3 py-2" value={w.role || ''} onChange={(e)=>updateWork(idx, widx, 'role', e.target.value)} />
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-sm">Duration</label>
                              <input className="w-full border rounded px-3 py-2" value={w.duration || ''} onChange={(e)=>updateWork(idx, widx, 'duration', e.target.value)} />
                            </div>
                            <button className="text-red-600 text-sm h-9 mt-5" onClick={()=>removeWork(idx, widx)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            className={`px-4 py-2 rounded text-white ${canSubmit ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400"}`}
            disabled={!canSubmit || saving}
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : "Save Candidates"}
          </button>
          <button className="px-4 py-2 rounded border" onClick={() => router.back()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
