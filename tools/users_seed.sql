-- Seed or rotate user credentials for Cyber Escape Rooms.
-- All passwords are stored as bcrypt hashes.

create table if not exists users (
  username text primary key,
  role text not null,
  password_hash text not null
);

with upserts(username, role, password_hash) as (
  values
    ('admin', 'admin', '$2a$12$MUFOWjchxaE30S5sSVqCcOP3Hds.D7MKMvhGqQuETdcAYxd.Ecn/y'),
    ('team1', 'team', '$2a$12$x4NfSIClB31yebzi36eOU.Hcz3jLLDNDbE05UWGkQt4RxCvhuFhiy'),
    ('team2', 'team', '$2a$12$7X3682DTTDUWt.4CsIA02.pq.qCQxIVI6AxJKdtKGvFlkHyrKjhBi'),
    ('team3', 'team', '$2a$12$3DrXLPn2lTjr7VcmCp4tBuwHkNEDbae/WONQeq8OnUtnKKjH31NTO'),
    ('team4', 'team', '$2a$12$II7EZvy7lO3S9dliHNU8kOq068tBG6zj3tL1KqqJlg4eQJlCGjq4e'),
    ('team5', 'team', '$2a$12$cmjwpNbfgHJAgAoxJ2LcYu8Ye2HWDlJbhC0q45xmIVEs/z8cvldbG'),
    ('trojan_horsin', 'team', '$2a$12$LAiG8/nATti2.d14ykZAouR1GAJer87GSTSikrBlVUJ2Ct/mvqbWq'),
    ('blackhoodies', 'team', '$2a$12$i1.bjZxSaqH3iTLoTK4o4.0BOYRJ/vsRSY5vx0seKJlGX0S8C7kKm'),
    ('cipherettes', 'team', '$2a$12$feFSjtqpknKDWgoLfjprfeCscj.8bXBLv15tHQojwozfVgmJLqzSy'),
    ('peas', 'team', '$2a$12$Y7yXRe/1dVjshQPoMFjzqO1xae0I9pDXiGRpT3jaIuqJS5yWpKr42'),
    ('sats', 'team', '$2a$12$QYgwax2Iiq/2IoOFxa8XYef1yTlsHj0.kdLYj/DdE2LSVtw7mbNYK'),
    ('darkwebaliens', 'team', '$2a$12$VnOnpdaB2nGIWgEr5He9DuXRyC1akedRGgd1ECj9h6Y/9oD.M9hii'),
    ('crossguild', 'team', '$2a$12$qhw7Xwc15.UBdx4xtHaWMeagJqz6JS/7UVha9KychFNp9Gu9sxIa2'),
    ('hobarthackers', 'team', '$2a$12$loch2IpIkvHG7hbnyLvOau27/xc5y8dO8TSnW5cfnU9CDsuXludiy'),
    ('specs', 'team', '$2a$12$0gBxNWznVlVA1aUY2J21BOLwgvPnar/nZgP7eC0Dr3P6DNN6XQvle'),
    ('gatecrashers', 'team', '$2a$12$O82xK2UF02kE1aIR7/BJ9eWLd/jZ4LCfw1Wn74nBzRw9OSSrFJ5bG')
)
insert into users (username, role, password_hash)
select * from upserts
on conflict (username) do update
  set role = excluded.role,
      password_hash = excluded.password_hash;

-- Facilitator note: username ↔ crew mapping
-- trojan_horsin  → Trojan Horsin' Around - Unmasking Cyber Deception with a Smile
-- blackhoodies   → The Black Hoodies
-- cipherettes    → Sydney Cipherettes
-- peas           → Understanding and prioritising Platform Engineering in the ABS (PEAS)
-- sats           → Crtl+alt+elite (SATS Team)
-- darkwebaliens  → Dark Web Aliens
-- crossguild     → Cross Guild
-- hobarthackers  → Hobart Hackers
-- specs          → SPECS
-- gatecrashers   → Gate Crashers
