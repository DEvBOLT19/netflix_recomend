from flask import Flask, render_template, request, jsonify
import pickle
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import os

app = Flask(__name__)

# ── Load pre-built artefacts if they exist, else build on first run ──────────
MOVIES_PKL = "movies.pkl"
MODEL_PKL  = "model.pkl"
CSV_PATH   = os.path.join("dataset", "movies.csv")

def load_or_build():
    if os.path.exists(MOVIES_PKL) and os.path.exists(MODEL_PKL):
        with open(MOVIES_PKL, "rb") as f:
            movies_df = pickle.load(f)
        with open(MODEL_PKL, "rb") as f:
            similarity = pickle.load(f)
        return movies_df, similarity

    # ── Build from CSV ────────────────────────────────────────────────────────
    df = pd.read_csv(CSV_PATH)

    # Normalise common column names
    df.columns = [c.strip().lower() for c in df.columns]

    # Required columns – adapt to your CSV schema here
    rename_map = {}
    for col in df.columns:
        if "title" in col:       rename_map[col] = "title"
        elif "genre" in col:     rename_map[col] = "genres"
        elif "overview" in col or "description" in col or "plot" in col:
            rename_map[col] = "overview"
        elif "director" in col:  rename_map[col] = "director"
        elif "cast" in col or "actor" in col: rename_map[col] = "cast"
        elif "rating" in col or "score" in col or "vote_average" in col:
            rename_map[col] = "rating"
        elif "year" in col or "release" in col: rename_map[col] = "year"
        elif "poster" in col or "image" in col or "img" in col:
            rename_map[col] = "poster"
    df.rename(columns=rename_map, inplace=True)

    for col in ["title", "genres", "overview", "director", "cast", "rating", "year", "poster"]:
        if col not in df.columns:
            df[col] = ""

    df.fillna("", inplace=True)
    df["rating"] = pd.to_numeric(df["rating"], errors="coerce").fillna(0)

    # Build a combined tag string for TF-IDF
    df["tags"] = (
        df["overview"].astype(str) + " " +
        df["genres"].astype(str)   + " " +
        df["director"].astype(str) + " " +
        df["cast"].astype(str)
    ).str.lower()

    tfidf = TfidfVectorizer(max_features=5000, stop_words="english")
    tfidf_matrix = tfidf.fit_transform(df["tags"])
    similarity = cosine_similarity(tfidf_matrix)

    # Persist
    with open(MOVIES_PKL, "wb") as f:
        pickle.dump(df, f)
    with open(MODEL_PKL, "wb") as f:
        pickle.dump(similarity, f)

    return df, similarity


movies_df, similarity = load_or_build()


# ── Helpers ──────────────────────────────────────────────────────────────────
def movie_to_dict(row):
    return {
        "title":    row.get("title", ""),
        "genres":   row.get("genres", ""),
        "overview": row.get("overview", ""),
        "rating":   round(float(row.get("rating", 0)), 1),
        "year":     str(row.get("year", ""))[:4],
        "poster":   row.get("poster", ""),
        "director": row.get("director", ""),
        "cast":     row.get("cast", ""),
    }


def get_recommendations(title, n=12):
    title_lower = title.strip().lower()
    matches = movies_df[movies_df["title"].str.lower() == title_lower]
    if matches.empty:
        matches = movies_df[movies_df["title"].str.lower().str.contains(title_lower, na=False)]
    if matches.empty:
        return []
    idx = matches.index[0]
    sim_scores = list(enumerate(similarity[idx]))
    sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)[1:n+1]
    return [movie_to_dict(movies_df.iloc[i]) for i, _ in sim_scores]


# ── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/search")
def search():
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify([])
    results = movies_df[movies_df["title"].str.lower().str.contains(query, na=False)]
    results = results.sort_values("rating", ascending=False).head(20)
    return jsonify([movie_to_dict(r) for _, r in results.iterrows()])


@app.route("/api/recommend")
def recommend():
    title = request.args.get("title", "")
    if not title:
        return jsonify({"error": "No title provided"}), 400
    recs = get_recommendations(title)
    return jsonify(recs)


@app.route("/api/browse")
def browse():
    genre  = request.args.get("genre", "").strip().lower()
    sort   = request.args.get("sort", "rating")   # rating | year | title
    page   = int(request.args.get("page", 1))
    limit  = int(request.args.get("limit", 24))

    df = movies_df.copy()
    if genre:
        df = df[df["genres"].str.lower().str.contains(genre, na=False)]

    if sort == "year":
        df = df.sort_values("year", ascending=False)
    elif sort == "title":
        df = df.sort_values("title")
    else:
        df = df.sort_values("rating", ascending=False)

    total   = len(df)
    start   = (page - 1) * limit
    end     = start + limit
    records = [movie_to_dict(r) for _, r in df.iloc[start:end].iterrows()]
    return jsonify({"total": total, "page": page, "results": records})


@app.route("/api/genres")
def genres():
    all_genres = set()
    for g in movies_df["genres"].dropna():
        for part in str(g).replace("|", ",").split(","):
            clean = part.strip()
            if clean:
                all_genres.add(clean)
    return jsonify(sorted(all_genres))


@app.route("/api/featured")
def featured():
    top = movies_df.sort_values("rating", ascending=False).head(10)
    return jsonify([movie_to_dict(r) for _, r in top.iterrows()])


if __name__ == "__main__":
    app.run(debug=True)
