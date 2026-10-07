NOIR X11 — v2.1 (Render-ready)
==============================
FOLDER STRUCTURE
  server.js  package.json  render.yaml  .gitignore  .env.example  README.txt
  data/projects.json            (starter projects)
  public/index.html             (website)
  public/admin.html             (admin panel)
  public/textures/              (your earth images, optional)

RUN LOCALLY (Node 18+)
  Mac/Linux: ADMIN_PASSWORD="your-long-password" node server.js
  Windows:   set ADMIN_PASSWORD=your-long-password && node server.js
  Site: http://localhost:3000    Admin: http://localhost:3000/admin

DEPLOY ON RENDER
  1. Push this folder to a GitHub repo.
  2. Render > New > Blueprint > pick the repo (uses render.yaml), or New > Web Service:
       Build: npm install     Start: node server.js     Health check path: /healthz
  3. Environment variables:  ADMIN_PASSWORD = your password (min 8 chars)
                             DATA_DIR       = /var/data
  4. Add a Disk: mount path /var/data (1 GB). Disks need a paid plan.
     Without a disk (free plan) the admin works, but projects you add are erased on every
     redeploy/restart. Use Admin > Export to keep a backup and Import to restore.
  5. HTTPS is automatic on Render. Admin: https://your-app.onrender.com/admin

NOTES
  - Login stays valid for 12 h, even across restarts. Changing ADMIN_PASSWORD logs everyone out.
  - 5 wrong passwords per minute per IP are blocked.
  - Free plan sleeps after inactivity: first visit can take ~30-50 s to wake up.
  - Website screenshots come from a free WordPress screenshot service; upload your own
    preview image in admin for any site that doesn't render.
