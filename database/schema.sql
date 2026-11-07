CREATE DATABASE IF NOT EXISTS tutorhub;
USE tutorhub;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('student','tutor','admin') NOT NULL,
  subjects VARCHAR(255),
  rate INT,
  work_start TIME,
  work_end TIME,
  break_start TIME,
  break_end TIME,
  days VARCHAR(40),
  bio VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  tutor_id INT NOT NULL,
  subject VARCHAR(50) NOT NULL,
  appt_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  mode ENUM('Online','Face-to-face') NOT NULL,
  notes TEXT,
  status ENUM('Pending','Approved','Rejected','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  created DATE NOT NULL,
  new_date DATE,
  new_start TIME,
  new_end TIME,
  change_reason VARCHAR(255),
  INDEX idx_tutor_date (tutor_id, appt_date),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tutor_id) REFERENCES users(id) ON DELETE CASCADE
);
