alter table "public"."dialectic_projects" add column "selected_domain_id" uuid;

alter table "public"."dialectic_projects" add constraint "dialectic_projects_selected_domain_id_fkey" FOREIGN KEY (selected_domain_id) REFERENCES dialectic_domains(id) not valid;

alter table "public"."dialectic_projects" validate constraint "dialectic_projects_selected_domain_id_fkey";

alter table "public"."dialectic_projects" drop column "selected_domain_tag";

alter table "public"."dialectic_projects" alter column "selected_domain_id" set not null;
