import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON;
const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL; // 관리자 이메일

const SOURCES = {
  oiljang:     { label: "오일장",    color: "#0077b6" },
  oiljang_line:{ label: "줄광고",    color: "#023e8a" },
};

const STATUS_CONFIG = {
  new:       { label: "신규",    color: "#22c55e", bg: "#052e16" },
  called:    { label: "연락완료", color: "#3b82f6", bg: "#0c1a2e" },
  callback:  { label: "콜백예정", color: "#f59e0b", bg: "#2d1f00" },
  acquired:  { label: "물건확보", color: "#a78bfa", bg: "#1e1030" },
  rejected:  { label: "거절",    color: "#6b7280", bg: "#1a1a1a" },
  duplicate: { label: "중복",    color: "#9ca3af", bg: "#111" },
};

async function sbFetch(path, opts = {}, token = null) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${token || SUPABASE_ANON}`,
      "Content-Type": "application/json",
      "Prefer": opts.method === "PATCH" || opts.method === "DELETE" ? "return=minimal" : "return=representation",
    },
    body: opts.body,
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

async function sbAuth(action, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${action}`, {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "인증 오류");
  return data;
}

async function sbAdminCreateUser(email, password, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || "계정 생성 실패");
  return data;
}

function timeAgo(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)    return "방금";
  if (s < 3600)  return `${Math.floor(s/60)}분 전`;
  if (s < 86400) return `${Math.floor(s/3600)}시간 전`;
  return `${Math.floor(s/86400)}일 전`;
}

// ── 로그인 화면 ──
function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true); setError("");
    try {
      const data = await sbAuth("token?grant_type=password", email, password);
      const allowed = await sbFetch(`allowed_users?email=eq.${encodeURIComponent(email)}&select=email,name`);
      if (!allowed || allowed.length === 0) throw new Error("접근 권한이 없습니다. 관리자에게 문의하세요.");
      onLogin({ token: data.access_token, email, name: allowed[0].name || email.split("@")[0], isAdmin: email === ADMIN_EMAIL });
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily:"'Noto Sans KR',sans-serif", background:"#0d1117", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet"/>
      <div style={{ width:360, background:"#161b22", border:"1px solid #21262d", borderRadius:12, padding:32 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#e85d04,#f48c06)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#fff" }}>V</div>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:"#e6edf3" }}>Verita</div>
            <div style={{ fontSize:11, color:"#6e7681" }}>매물 수집 시스템</div>
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:"#8b949e", marginBottom:6 }}>이메일</div>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="이메일 입력"
            style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"9px 12px", color:"#e6edf3", fontSize:13, outline:"none" }}
          />
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:"#8b949e", marginBottom:6 }}>비밀번호</div>
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="비밀번호 입력"
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"9px 12px", color:"#e6edf3", fontSize:13, outline:"none" }}
          />
        </div>
        {error && <div style={{ background:"#2d0f0f", border:"1px solid #7f1d1d", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#fca5a5", marginBottom:14 }}>{error}</div>}
        <button onClick={handleLogin} disabled={loading}
          style={{ width:"100%", background:loading?"#21262d":"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:7, padding:"11px 0", fontSize:14, fontWeight:700, cursor:loading?"not-allowed":"pointer" }}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
        <div style={{ marginTop:14, fontSize:11, color:"#6e7681", textAlign:"center" }}>계정이 없으면 관리자에게 문의하세요</div>
      </div>
    </div>
  );
}

// ── 관리자 페이지 ──
function AdminPage({ user, onBack }) {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [newEmail, setNewEmail]   = useState("");
  const [newName, setNewName]     = useState("");
  const [newPw, setNewPw]         = useState("");
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await sbFetch("allowed_users?select=*&order=created_at.desc", {}, user.token);
      setUsers(data);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function createUser() {
    if (!newEmail || !newPw || !newName) { setError("이름, 이메일, 비밀번호 모두 입력하세요"); return; }
    setCreating(true); setError(""); setSuccess("");
    try {
      // 1. allowed_users에 추가
      await sbFetch("allowed_users", { method:"POST", body:JSON.stringify({ email:newEmail, name:newName }) }, user.token);
      // 2. Supabase Auth에 계정 생성 시도 (실패해도 allowed_users는 추가됨)
      try {
        await sbAdminCreateUser(newEmail, newPw, user.token);
      } catch(e) {
        // admin API 권한 없으면 일반 signup으로 fallback
        await sbAuth("signup", newEmail, newPw);
      }
      setSuccess(`✅ ${newName} (${newEmail}) 계정 생성 완료! 비밀번호: ${newPw}`);
      setNewEmail(""); setNewName(""); setNewPw("");
      loadUsers();
    } catch(e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(email) {
    if (!window.confirm(`${email} 계정을 삭제할까요?`)) return;
    try {
      await sbFetch(`allowed_users?email=eq.${encodeURIComponent(email)}`, { method:"DELETE" }, user.token);
      loadUsers();
    } catch(e) { setError(e.message); }
  }

  return (
    <div style={{ fontFamily:"'Noto Sans KR',sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet"/>
      <div style={{ background:"#161b22", borderBottom:"1px solid #21262d", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"1px solid #30363d", color:"#8b949e", borderRadius:6, padding:"5px 12px", fontSize:12, cursor:"pointer" }}>← 돌아가기</button>
          <span style={{ fontWeight:700, fontSize:14 }}>관리자 페이지</span>
        </div>
        <span style={{ fontSize:12, color:"#6e7681" }}>👤 {user.name}</span>
      </div>

      <div style={{ maxWidth:600, margin:"40px auto", padding:"0 20px" }}>
        {/* 계정 생성 */}
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:24, marginBottom:24 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:18 }}>새 계정 생성</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:6 }}>이름</div>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="홍길동"
                style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"8px 10px", color:"#e6edf3", fontSize:12, outline:"none" }}
              />
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:6 }}>이메일</div>
              <input value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="email@gmail.com"
                style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"8px 10px", color:"#e6edf3", fontSize:12, outline:"none" }}
              />
            </div>
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:"#6e7681", marginBottom:6 }}>임시 비밀번호</div>
            <input value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="임시 비밀번호 (6자 이상)"
              style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"8px 10px", color:"#e6edf3", fontSize:12, outline:"none" }}
            />
          </div>

          {error && <div style={{ background:"#2d0f0f", border:"1px solid #7f1d1d", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#fca5a5", marginBottom:12 }}>{error}</div>}
          {success && <div style={{ background:"#052e16", border:"1px solid #16a34a", borderRadius:6, padding:"10px 12px", fontSize:12, color:"#86efac", marginBottom:12, lineHeight:1.6 }}>{success}</div>}

          <button onClick={createUser} disabled={creating}
            style={{ background:creating?"#21262d":"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:7, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:creating?"not-allowed":"pointer" }}>
            {creating ? "생성 중..." : "계정 생성"}
          </button>
        </div>

        {/* 사용자 목록 */}
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:24 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:18 }}>허용된 사용자 ({users.length}명)</div>
          {loading ? (
            <div style={{ color:"#6e7681", fontSize:13 }}>로딩 중...</div>
          ) : (
            users.map(u => (
              <div key={u.email} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", background:"#0d1117", borderRadius:7, marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#e6edf3" }}>{u.name}</div>
                  <div style={{ fontSize:11, color:"#6e7681", marginTop:2 }}>{u.email}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {u.email === ADMIN_EMAIL && <span style={{ fontSize:10, color:"#f48c06", background:"#2d1f00", padding:"2px 8px", borderRadius:10 }}>관리자</span>}
                  {u.email !== ADMIN_EMAIL && (
                    <button onClick={()=>deleteUser(u.email)}
                      style={{ background:"none", border:"1px solid #7f1d1d", color:"#fca5a5", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── 상세 패널 ──
function DetailPanel({ lead, note, setNote, onClose, onStatus, onSave, saving }) {
  const src = SOURCES[lead.source] || { label: lead.source, color: "#555" };
  const rows = [
    { label: "지번주소", value: lead.address_jibun || lead.address_raw?.slice(0,60) || "-" },
    { label: "연락처",   value: lead.phone },
    { label: "가격",     value: lead.price || "-" },
    { label: "면적",     value: lead.area_m2 ? `${Number(lead.area_m2).toLocaleString()}㎡` : "-" },
    { label: "중개사",   value: lead.broker || "-" },
  ];
  return (
    <div style={{ width:284, flexShrink:0, background:"#161b22", borderLeft:"1px solid #21262d", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"12px 14px", borderBottom:"1px solid #21262d", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, overflow:"hidden" }}>
          <span style={{ background:src.color, color:"#fff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, whiteSpace:"nowrap", flexShrink:0 }}>{src.label}</span>
          <span style={{ fontSize:12, fontWeight:700, color:"#e6edf3", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lead.title}</span>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#8b949e", cursor:"pointer", fontSize:16, flexShrink:0, marginLeft:6 }}>✕</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:14 }}>
        <div style={{ background:"#0d1117", borderRadius:8, overflow:"hidden", marginBottom:12 }}>
          {rows.map(({ label, value }, i) => (
            <div key={label} style={{ display:"grid", gridTemplateColumns:"60px 1fr", padding:"9px 12px", borderBottom:i<rows.length-1?"1px solid #21262d":"none", alignItems:"start" }}>
              <span style={{ fontSize:11, color:"#6e7681", paddingTop:1, whiteSpace:"nowrap" }}>{label}</span>
              <span style={{ fontSize:12, color:"#e6edf3", fontWeight:label==="연락처"?600:400, wordBreak:"break-all", lineHeight:1.5 }}>{value}</span>
            </div>
          ))}
        </div>
        {lead.description && (
          <div style={{ background:"#0d1117", borderRadius:8, padding:"10px 12px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:"#6e7681", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.7px" }}>광고 전문</div>
            <div style={{ fontSize:11, color:"#8b949e", lineHeight:1.7, wordBreak:"break-all" }}>{lead.description}</div>
          </div>
        )}
        <a href={`tel:${lead.phone}`} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"linear-gradient(135deg,#16a34a,#22c55e)", color:"#fff", padding:"10px 0", borderRadius:7, fontSize:13, fontWeight:700, textDecoration:"none", marginBottom:12 }}>
          📞 {lead.phone}
        </a>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:7 }}>상태</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5 }}>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={()=>onStatus(key)} style={{ padding:"6px 0", borderRadius:6, cursor:"pointer", border:`1px solid ${lead.status===key?cfg.color:"#30363d"}`, background:lead.status===key?cfg.bg:"transparent", color:lead.status===key?cfg.color:"#6e7681", fontSize:11, fontWeight:lead.status===key?700:400 }}>
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:7 }}>통화 메모</div>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="통화 내용, 소유자 반응, 특이사항..."
            style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"9px 10px", color:"#e6edf3", fontSize:12, minHeight:90, resize:"vertical", outline:"none", fontFamily:"inherit", lineHeight:1.6 }}
          />
          <button onClick={onSave} disabled={saving} style={{ marginTop:6, width:"100%", background:"#21262d", border:"1px solid #30363d", color:saving?"#6e7681":"#c9d1d9", padding:"8px 0", borderRadius:6, fontSize:12, cursor:saving?"not-allowed":"pointer", fontWeight:600 }}>
            {saving?"저장 중...":"저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 대시보드 ──
function Dashboard({ user, onLogout, onAdmin }) {
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("all");
  const [srcFilter, setSrcFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState(null);
  const [note, setNote]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadLeads = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await sbFetch("property_leads?select=*&order=collected_at.desc&limit=300", {}, user.token);
      setLeads(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [user.token]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const today = new Date().toISOString().slice(0,10);

  const AREAS = [["제주시", "제주시"], ["서귀포시", "서귀포시"]];

  const filtered = leads.filter(l => {
    if (filter !== "all" && l.status !== filter) return false;
    if (srcFilter !== "all" && l.source !== srcFilter) return false;
    if (areaFilter !== "all") {
      const addr = (l.address_jibun || l.address_raw || "");
      if (!addr.includes(areaFilter)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hay = [l.address_jibun,l.address_raw,l.phone,l.title,l.description,l.broker].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = Object.fromEntries(Object.keys(STATUS_CONFIG).map(s=>[s,leads.filter(l=>l.status===s).length]));
  const todayCount = leads.filter(l=>l.collected_at?.startsWith(today)).length;

  async function updateStatus(newStatus) {
    try {
      await sbFetch(`property_leads?id=eq.${selected.id}`, { method:"PATCH", body:JSON.stringify({status:newStatus}) }, user.token);
      setLeads(p=>p.map(l=>l.id===selected.id?{...l,status:newStatus}:l));
      setSelected(p=>({...p,status:newStatus}));
    } catch(e) { alert("오류: "+e.message); }
  }

  async function saveNote() {
    setSaving(true);
    try {
      await sbFetch(`property_leads?id=eq.${selected.id}`, { method:"PATCH", body:JSON.stringify({note, contacted_at:new Date().toISOString()}) }, user.token);
      setLeads(p=>p.map(l=>l.id===selected.id?{...l,note}:l));
      setSelected(p=>({...p,note}));
    } catch(e) { alert("오류: "+e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ fontFamily:"'Noto Sans KR',sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet"/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}} *::-webkit-scrollbar{width:4px} *::-webkit-scrollbar-track{background:#0d1117} *::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}`}</style>

      <div style={{ background:"#161b22", borderBottom:"1px solid #21262d", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:26, height:26, background:"linear-gradient(135deg,#e85d04,#f48c06)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700 }}>V</div>
          <span style={{ fontWeight:700, fontSize:14 }}>Verita 매물 수집</span>
          <span style={{ fontSize:10, color:"#22c55e", background:"#052e16", padding:"2px 8px", borderRadius:10, border:"1px solid #16a34a" }}>● Live</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {lastRefresh && <span style={{ fontSize:11, color:"#6e7681" }}>갱신 {lastRefresh.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</span>}
          <span style={{ fontSize:12, color:"#8b949e" }}>👤 {user.name}</span>
          {user.isAdmin && (
            <button onClick={onAdmin} style={{ background:"#21262d", border:"1px solid #30363d", color:"#f48c06", borderRadius:6, padding:"6px 12px", fontSize:12, cursor:"pointer", fontWeight:600 }}>
              ⚙️ 관리자
            </button>
          )}
          <button onClick={loadLeads} disabled={loading} style={{ background:loading?"#21262d":"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:6, padding:"6px 13px", fontSize:12, fontWeight:600, cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ display:"inline-block", animation:loading?"spin 1s linear infinite":"none" }}>⟳</span>
            {loading?"불러오는 중...":"목록 새로고침"}
          </button>
          <button onClick={onLogout} style={{ background:"none", border:"1px solid #30363d", color:"#8b949e", borderRadius:6, padding:"6px 12px", fontSize:12, cursor:"pointer" }}>로그아웃</button>
        </div>
      </div>

      {error && <div style={{ background:"#2d0f0f", borderBottom:"1px solid #7f1d1d", padding:"8px 20px", fontSize:12, color:"#fca5a5" }}>⚠️ {error}</div>}

      <div style={{ display:"flex", height:"calc(100vh - 52px)" }}>
        <div style={{ width:148, background:"#161b22", borderRight:"1px solid #21262d", padding:"14px 0", flexShrink:0, overflowY:"auto" }}>
          <div style={{ padding:"0 12px 8px", fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>상태</div>
          {[["all","전체",leads.length],...Object.entries(STATUS_CONFIG).map(([k,v])=>[k,v.label,counts[k]])].map(([key,label,count])=>(
            <button key={key} onClick={()=>setFilter(key)} style={{ width:"100%", textAlign:"left", padding:"7px 12px", background:filter===key?"#21262d":"transparent", border:"none", color:filter===key?"#e6edf3":"#8b949e", fontSize:12, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span>{label}</span>
              <span style={{ fontSize:10, background:filter===key?"#30363d":"transparent", padding:"1px 6px", borderRadius:8, color:filter===key?"#e6edf3":"#6e7681" }}>{count}</span>
            </button>
          ))}
          <div style={{ margin:"12px 12px 8px", height:1, background:"#21262d" }}/>
          <div style={{ padding:"0 12px 8px", fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>소스</div>
          {[["all","전체"],...Object.entries(SOURCES).map(([k,v])=>[k,v.label])].map(([key,label])=>(
            <button key={key} onClick={()=>setSrcFilter(key)} style={{ width:"100%", textAlign:"left", padding:"6px 12px", background:srcFilter===key?"#21262d":"transparent", border:"none", color:srcFilter===key?"#e6edf3":"#8b949e", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:7 }}>
              {key!=="all"&&<span style={{ width:7, height:7, borderRadius:"50%", background:SOURCES[key]?.color, flexShrink:0 }}/>}
              {label}
            </button>
          ))}
          <div style={{ margin:"12px 12px 10px", height:1, background:"#21262d" }}/>
          <div style={{ padding:"0 12px" }}>
            <div style={{ fontSize:10, color:"#6e7681", marginBottom:4 }}>오늘 수집</div>
            <div style={{ fontSize:26, fontWeight:700, color:"#f48c06", lineHeight:1 }}>{todayCount}</div>
            <div style={{ fontSize:10, color:"#6e7681", marginTop:2 }}>총 {leads.length}건</div>
          </div>
          <div style={{ margin:"12px 12px 8px", height:1, background:"#21262d" }}/>
          <div style={{ padding:"0 12px 8px", fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>지역</div>
          {[["all","전체"],["제주시","제주시"],["서귀포시","서귀포시"]].map(([key,label])=>(
            <button key={key} onClick={()=>setAreaFilter(key)}
              style={{ width:"100%", textAlign:"left", padding:"6px 12px", background:areaFilter===key?"#21262d":"transparent", border:"none", color:areaFilter===key?"#e6edf3":"#8b949e", fontSize:12, cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"10px 12px", borderBottom:"1px solid #21262d", background:"#161b22" }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="주소 · 연락처 · 제목 검색..."
              style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 11px", color:"#e6edf3", fontSize:12, outline:"none", boxSizing:"border-box" }}
            />
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"6px" }}>
            {loading && <div style={{ textAlign:"center", padding:"60px 0", color:"#6e7681" }}><div style={{ fontSize:24, animation:"spin 1s linear infinite", display:"inline-block" }}>⟳</div><div style={{ marginTop:8, fontSize:13 }}>불러오는 중...</div></div>}
            {!loading && filtered.length===0 && <div style={{ textAlign:"center", padding:"60px 0", color:"#6e7681", fontSize:13 }}>데이터 없음</div>}
            {!loading && filtered.map((lead,i)=>{
              const src=SOURCES[lead.source]||{label:lead.source,color:"#555"};
              const st=STATUS_CONFIG[lead.status]||STATUS_CONFIG.new;
              const active=selected?.id===lead.id;
              const isNew = lead.collected_at?.startsWith(today);
              return (
                <div key={lead.id} onClick={()=>{setSelected(lead);setNote(lead.note||"");}}
                  style={{ background:active?"#1c2128":"#161b22", border:`1px solid ${isNew&&!active?"#f48c0644":active?"#388bfd44":"#21262d"}`, borderRadius:7, padding:"10px 12px", marginBottom:4, cursor:"pointer", transition:"background 0.12s", animation:`fadeIn 0.18s ease ${Math.min(i,20)*0.02}s both` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
                    <span style={{ background:src.color, color:"#fff", fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, whiteSpace:"nowrap", flexShrink:0 }}>{src.label}</span>
                    {isNew && <span style={{ background:"#f48c06", color:"#fff", fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:3, whiteSpace:"nowrap", flexShrink:0, letterSpacing:"0.5px" }}>NEW</span>}
                    <span style={{ fontSize:12, fontWeight:600, color:"#e6edf3", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lead.title}</span>
                    <span style={{ background:st.bg, color:st.color, fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:10, whiteSpace:"nowrap", flexShrink:0 }}>{st.label}</span>
                    <span style={{ fontSize:10, color:"#6e7681", whiteSpace:"nowrap", flexShrink:0 }}>{timeAgo(lead.collected_at)}</span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:"0 14px", fontSize:11, color:"#8b949e" }}>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📍 {lead.address_jibun||lead.address_raw?.slice(0,30)||"-"}</span>
                    <span style={{ whiteSpace:"nowrap" }}>📞 {lead.phone}</span>
                    <span style={{ whiteSpace:"nowrap" }}>💰 {lead.price||"-"}</span>
                  </div>
                  {lead.note&&<div style={{ marginTop:6, fontSize:10, color:"#f48c06", background:"#1a1206", padding:"3px 8px", borderRadius:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>💬 {lead.note}</div>}
                </div>
              );
            })}
          </div>
        </div>
        {selected&&<DetailPanel lead={selected} note={note} setNote={setNote} onClose={()=>setSelected(null)} onStatus={updateStatus} onSave={saveNote} saving={saving}/>}
      </div>
    </div>
  );
}

// ── 앱 루트 ──
export default function App() {
  const [user, setUser]     = useState(() => { try { return JSON.parse(localStorage.getItem("verita_user")); } catch { return null; } });
  const [page, setPage]     = useState("dashboard");

  function handleLogin(userData) {
    localStorage.setItem("verita_user", JSON.stringify(userData));
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem("verita_user");
    setUser(null); setPage("dashboard");
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;
  if (page === "admin" && user.isAdmin) return <AdminPage user={user} onBack={()=>setPage("dashboard")} />;
  return <Dashboard user={user} onLogout={handleLogout} onAdmin={()=>setPage("admin")} />;
}
