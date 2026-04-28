{
  description = "Dev shell for anki-language-sentence-study-decks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            git
            uv
            python312
            ruff
            patch
            ffmpeg
          ];

          shellHook = ''
            export UV_PROJECT_ENVIRONMENT=".venv"
            repo_root="$(${pkgs.git}/bin/git rev-parse --show-toplevel 2>/dev/null || pwd)"

            # create env file
            if [ ! -f "$repo_root/apps/deck-cli/.env" ] && [ -f "$repo_root/apps/deck-cli/.env.example" ]; then
              cp "$repo_root/apps/deck-cli/.env.example" "$repo_root/apps/deck-cli/.env"
              echo "Created apps/deck-cli/.env from apps/deck-cli/.env.example"
            fi

            # bun install for deck-cli
            if [ -f "$repo_root/apps/deck-cli/package.json" ]; then
              echo "Installing JS deps in apps/deck-cli/"
              bun install --cwd "$repo_root/apps/deck-cli"
            fi

            # bun install for card-template
            if [ -f "$repo_root/apps/card-template/package.json" ]; then
              echo "Installing JS deps in apps/card-template/"
              bun install --cwd "$repo_root/apps/card-template"
            fi

            # uv sync for argos translation
            if [ -f "$repo_root/apps/argos-translate-service/pyproject.toml" ]; then
              echo "Installing Python deps in apps/argos-translate-service/"
              uv sync --directory "$repo_root/apps/argos-translate-service"
            fi

            echo "Dev shell ready."
          '';
        };
      }
    );
}
