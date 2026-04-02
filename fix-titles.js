const fs = require('fs');

const requestsPath = '../cluso-customer/app/dashboard/requests/page.tsx';
let r = fs.readFileSync(requestsPath, 'utf8');
r = r.replace(/className="text-xl\s+font-bold\s+text-slate-800[^"]*"/g, 'style={{ fontSize: "0.98rem", color: "#2D405E", margin: 0, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}');
r = r.replace(/className="text-lg\s+font-bold\s+text-slate-800[^"]*"/g, 'style={{ fontSize: "0.98rem", color: "#2D405E", margin: 0, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}');
fs.writeFileSync(requestsPath, r);

const teamPath = '../cluso-customer/app/dashboard/team/page.tsx';
let t = fs.readFileSync(teamPath, 'utf8');
t = t.replace(/className="text-base\s+font-semibold\s+text-slate-800[^"]*"/g, 'style={{ fontSize: "0.98rem", color: "#2D405E", margin: 0, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}');
t = t.replace(/className="text-lg\s+font-semibold\s+text-slate-800[^"]*"/g, 'style={{ fontSize: "0.98rem", color: "#2D405E", margin: 0, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}');
fs.writeFileSync(teamPath, t);

const settingsPath = '../cluso-customer/app/dashboard/settings/page.tsx';
let s = fs.readFileSync(settingsPath, 'utf8');
s = s.replace(/<h3\s+className="settings-form-heading">/g, '<h3 className="settings-form-heading" style={{ fontSize: "0.98rem", color: "#2D405E", margin: 0, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>');
fs.writeFileSync(settingsPath, s);

console.log('done');
