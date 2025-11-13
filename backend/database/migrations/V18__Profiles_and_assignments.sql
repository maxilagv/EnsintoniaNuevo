-- V18: Profiles, ProfilePermissions and UserProfiles

CREATE TABLE IF NOT EXISTS Profiles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

-- updated_at trigger
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON Profiles
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- soft delete trigger
CREATE TRIGGER trg_profiles_soft_delete
  BEFORE DELETE ON Profiles
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TABLE IF NOT EXISTS ProfilePermissions (
  profile_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (profile_id, permission_id),
  FOREIGN KEY (profile_id) REFERENCES Profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES Permissions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS UserProfiles (
  user_id INT NOT NULL,
  profile_id INT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, profile_id),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES Profiles(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Only one primary profile per user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uq_user_primary_profile'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_user_primary_profile ON UserProfiles(user_id) WHERE is_primary = TRUE';
  END IF;
END$$;
