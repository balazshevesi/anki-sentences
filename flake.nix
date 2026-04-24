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
            uv
            python312
            ruff
            patch
            ffmpeg
          ];

          shellHook = ''
            export UV_PROJECT_ENVIRONMENT=".venv"

            if [ ! -f apps/deck-cli/.env ] && [ -f apps/deck-cli/.env.example ]; then
              cp apps/deck-cli/.env.example apps/deck-cli/.env
              echo "Created apps/deck-cli/.env from apps/deck-cli/.env.example"
            fi

            if [ -f apps/deck-cli/package.json ]; then
              echo "Installing JS deps in apps/deck-cli/"
              bun install --cwd apps/deck-cli
            fi

            if [ -f apps/card-template/package.json ]; then
              echo "Installing JS deps in apps/card-template/"
              bun install --cwd apps/card-template
            fi

            if [ -f apps/argos-translate-service/pyproject.toml ]; then
              echo "Installing Python deps in apps/argos-translate-service/"
              uv sync --directory apps/argos-translate-service
            fi

            echo "Dev shell ready."
          '';
        };
      }
    );
}
