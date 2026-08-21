-- Replace this value with Authentication > Users > your user UUID.
-- The psql-style variable below is intentionally avoided so this runs in Supabase SQL Editor.

do $$
declare
  owner_id uuid := 'YOUR_USER_UUID';
begin
  insert into categories (user_id, name, color, in_pie, sort_order, info_examples, info_counter, info_edge)
  select owner_id, v.name, v.color, v.in_pie, v.sort_order, v.examples, v.counter, v.edge
  from (values
    ('Career', '#D55D42', true, 1, 'Paid work, building a company, professional craft.', 'Household admin or learning with no career purpose.', 'If the learning is inseparable from the work, keep it in Career.'),
    ('Community', '#D49A38', true, 2, 'Volunteering, neighbourhood work, civic participation.', 'Paid work for a social-impact organisation.', 'Classify by what you were doing, not the organisation''s mission.'),
    ('Parenting', '#C2A93B', true, 3, 'Direct care, play, teaching, and time with your children.', 'Household work done while children happen to be nearby.', 'A split is useful when another distinct person or activity is truly present.'),
    ('Romance', '#C96B76', true, 4, 'Deliberate connection and shared time with a partner.', 'Parallel chores or passive co-presence.', 'Ask whether the relationship was part of the activity itself.'),
    ('Family', '#A86B8E', true, 5, 'Time with parents, siblings, and extended family.', 'Parenting your own children; use Parenting.', 'Care work can be Family when the relationship is the reason for it.'),
    ('Friends', '#6D75A8', true, 6, 'Conversation, visits, shared meals, and activities with friends.', 'Networking whose main purpose is work.', 'Gym with a friend may be a real split; a friendly gym visit may not be.'),
    ('Recreation', '#357F91', true, 7, 'Play, hobbies, entertainment, and rest chosen for enjoyment.', 'Exercise done mainly for health.', 'The same walk can be Recreation or Physical health depending on its purpose.'),
    ('Physical health', '#4E9273', true, 8, 'Exercise, medical care, recovery, and active sleep care.', 'General grooming and routine household maintenance.', 'A social workout can be split when both parts genuinely happen at once.'),
    ('Spiritual', '#7A9161', true, 9, 'Prayer, meditation, worship, reflection, spiritual community.', 'Generic relaxation without spiritual intent.', 'The label follows your own definition, which you can edit over time.'),
    ('Personal growth', '#8C755B', true, 10, 'Learning, therapy, journaling, and deliberate self-development.', 'Learning that is simply part of doing your job.', 'If growth is only a benefit of another activity, do not split it.'),
    ('Maintenance', '#898780', false, 11, 'Cleaning, groceries, commuting, admin, hygiene, basic upkeep.', 'Activities chosen for one of your discretionary life domains.', 'Maintenance is tracked as context but excluded from intent-versus-actual maths.')
  ) as v(name, color, in_pie, sort_order, examples, counter, edge)
  where not exists (select 1 from categories c where c.user_id = owner_id and c.name = v.name);
end $$;
