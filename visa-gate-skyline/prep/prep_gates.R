# prep_gates.R

# if packages missing error, run this
# install.packages(c("readr","dplyr"))

library(readr)
library(dplyr)

# setting paths
in_path  <- file.path("data", "visitor-visa-statistics.csv")
out_path <- file.path("data", "gates.csv")

raw <- read_csv(in_path, show_col_types = FALSE)

gates <- raw %>%
  mutate(
    reporting_year = as.integer(reporting_year),
    visitor_visa_applications = as.numeric(visitor_visa_applications),
    visitor_visa_issued = as.numeric(visitor_visa_issued),
    visitor_visa_not_issued = as.numeric(visitor_visa_not_issued)
  ) %>%
  group_by(
    reporting_year,
    reporting_state,
    consulate_country,
    consulate_country_income_group,
    consulate_country_region
  ) %>%
  summarise(
    apps = sum(visitor_visa_applications, na.rm = TRUE),
    issued = sum(visitor_visa_issued, na.rm = TRUE),
    not_issued = sum(visitor_visa_not_issued, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  mutate(
    denom = pmax(issued + not_issued, 1),  # avoid divide by 0, annoying but needed
    refusal_rate = not_issued / denom
  ) %>%
  select(
    year = reporting_year,
    reporting_state,
    consulate_country,
    income_group = consulate_country_income_group,
    region = consulate_country_region,
    apps,
    issued,
    not_issued,
    refusal_rate
  ) %>%
  arrange(year, reporting_state, desc(apps))

write_csv(gates, out_path)

cat("done, wrote:", out_path, "\n")