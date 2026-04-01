import pandas as pd
import numpy as np

MASTER_FILE = "transfers_with_wikidata_locations.csv"
OUTPUT_FILE = "data/player_journeys_map_ready.csv"

LEAGUE_LABELS = {
    "GB1": "Premier League",
    "ES1": "La Liga",
    "IT1": "Serie A",
    "L1": "Bundesliga",
    "FR1": "Ligue 1",
    "NL1": "Eredivisie",
    "PO1": "Primeira Liga",
}

def main():
    df = pd.read_csv(MASTER_FILE)

    # keep one event per transfer_id, preferring the "in" perspective
    df["dir_priority"] = df["dir"].map({"in": 0, "left": 1}).fillna(2)
    base = (
        df.sort_values(["transfer_id", "dir_priority"])
          .drop_duplicates("transfer_id", keep="first")
          .copy()
    )

    is_in = base["dir"].eq("in")

    base["from_team_name"] = np.where(is_in, base["counter_team_name"], base["team_name"])
    base["from_team_country"] = np.where(is_in, base["counter_team_country"], base["team_country"])
    base["from_longitude"] = np.where(is_in, base["counter_team_longitude"], base["team_longitude"])
    base["from_latitude"] = np.where(is_in, base["counter_team_latitude"], base["team_latitude"])

    base["to_team_name"] = np.where(is_in, base["team_name"], base["counter_team_name"])
    base["to_team_country"] = np.where(is_in, base["team_country"], base["counter_team_country"])
    base["to_longitude"] = np.where(is_in, base["team_longitude"], base["counter_team_longitude"])
    base["to_latitude"] = np.where(is_in, base["team_latitude"], base["counter_team_latitude"])

    base["has_both_locations"] = (
        base["from_longitude"].notna()
        & base["from_latitude"].notna()
        & base["to_longitude"].notna()
        & base["to_latitude"].notna()
    )

    base["move_type"] = np.select(
        [
            base["is_retired"].fillna(False),
            base["is_loan_end"].fillna(False),
            base["is_loan"].fillna(False),
            base["is_free"].fillna(False),
        ],
        ["retired", "loan_end", "loan", "free"],
        default="transfer",
    )

    base["league_label"] = base["league"].map(LEAGUE_LABELS).fillna(base["league"])
    base["window_label"] = base["window"].map({"s": "Summer", "w": "Winter"}).fillna(base["window"])

    core = base[base["has_both_locations"]].copy()
    core["season"] = pd.to_numeric(core["season"], errors="coerce").astype("Int64")
    core["window_order"] = core["window"].map({"s": 0, "w": 1}).fillna(2)

    core = core.sort_values(["player_id", "season", "window_order", "transfer_id"]).copy()
    core["career_move_no"] = core.groupby("player_id").cumcount() + 1

    player_stats = core.groupby(["player_id", "player_name"]).agg(
        journey_moves=("transfer_id", "size"),
        first_season=("season", "min"),
        last_season=("season", "max"),
    ).reset_index()

    core = core.merge(player_stats, on=["player_id", "player_name"], how="left")

    fields = [
        "transfer_id", "player_id", "player_name", "player_age", "player_nation", "player_nation2",
        "player_pos", "season", "window", "window_label", "league", "league_label", "team_name",
        "team_country", "counter_team_name", "counter_team_country", "transfer_fee_amnt",
        "market_val_amnt", "is_free", "is_loan", "is_loan_end", "is_retired", "move_type",
        "from_team_name", "from_team_country", "from_longitude", "from_latitude", "to_team_name",
        "to_team_country", "to_longitude", "to_latitude", "career_move_no", "journey_moves",
        "first_season", "last_season",
    ]

    core[fields].to_csv(OUTPUT_FILE, index=False)
    print(f"Saved {len(core):,} rows to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
